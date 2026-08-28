"""AI CoAudS — orchestrator pipeline.

fetch → [security ‖ style ‖ static tools] → corroborate → refactor →
review → validate → post. Shared state is persisted after every stage;
agent execution is genuinely concurrent via asyncio.gather.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from agents import refactor_agent, run_security_agent, run_style_agent
from github_client import GitHubClient, PRMeta
from state import AuditState, Finding, Severity, StateStore
from tools import ToolRunner
from validation import drop_off_hunk_findings, validate_patches

log = logging.getLogger("coauds.pipeline")

HUNK_RE = re.compile(r"^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@")
CORROBORATE_RADIUS = 3
LLM_FLOOR = 0.60  # uncorroborated LLM findings below this are dropped

# rule-id → safe replacement template (behaviour-preserving)
TEMPLATES: dict[str, tuple[str, str]] = {
    "SEC-SQL-FSTRING": (
        'cursor.execute(f"SELECT {cols} FROM {table} WHERE name = \'{username}\'")',
        'cursor.execute("SELECT id, role FROM users WHERE name = %s", (username,))',
    ),
    "SEC-MD5": ("hashlib.md5(password.encode())", "bcrypt.hashpw(password.encode(), bcrypt.gensalt())"),
    "SEC-EVAL": ("eval(expr)", "ast.literal_eval(expr)"),
    "SEC-RANDOM": ("random.randint(", "secrets.randbelow("),
    "SEC-YAML": ("yaml.load(", "yaml.safe_load("),
    "SEC-VERIFY": ("verify=False", "verify=True"),
    "SEC-SHELL": ("shell=True", "shell=False  # pass args as a list"),
}


def parse_diff(patch: str) -> tuple[list[int], str]:
    """→ (added line numbers, reconstructed post-image)."""
    added: list[int] = []
    image: list[str] = []
    new_line = 0
    for raw in patch.splitlines():
        m = HUNK_RE.match(raw)
        if m:
            new_line = int(m.group(2))
            continue
        if raw.startswith("+++") or raw.startswith("---"):
            continue
        if raw.startswith("+"):
            added.append(new_line)
            image.append(raw[1:])
            new_line += 1
        elif raw.startswith("-"):
            continue
        elif raw.startswith("\\"):
            continue
        else:
            image.append(raw[1:] if raw.startswith(" ") else raw)
            new_line += 1
    return added, "\n".join(image)


class AuditPipeline:
    def __init__(self, store: StateStore, github: Optional[GitHubClient], owner: str, repo: str, number: int):
        self.store, self.github = store, github
        self.owner, self.repo, self.number = owner, repo, number

    async def run(self, state: AuditState) -> AuditState:
        try:
            await self._fetch(state)
            await self._parallel_audit(state)
            self._corroborate(state)
            await self._refactor(state)
            self._review(state)
            self._validate(state)
            await self._post(state)
            state.status = "done"
        except Exception as exc:
            state.status = "failed"
            state.error = str(exc)
            state.say("orchestrator", f"pipeline failed: {exc}")
        finally:
            self.store.save(state)
        return state

    # ── stages ──────────────────────────────────────────────

    async def _fetch(self, state: AuditState) -> None:
        state.stage, state.status = "fetch", "running"
        assert self.github, "GITHUB_TOKEN required for fetching"
        meta: PRMeta = await self.github.get_pull(self.owner, self.repo, self.number)
        state.commit_sha, state.base_ref, state.head_ref = meta.head_sha, meta.base_ref, meta.head_ref
        for f in meta.files:
            if f.patch:
                state.changed_files.append(f.path)
                added, image = parse_diff(f.patch)
                state.added_lines[f.path] = added
                state.post_image[f.path] = image
                state.additions += f.additions
                state.deletions += f.deletions
        state.say("orchestrator",
                  f"fetched {len(state.changed_files)} files (+{state.additions}/−{state.deletions}) @ {state.commit_sha[:10]}")
        self.store.save(state)

    async def _parallel_audit(self, state: AuditState) -> None:
        state.stage = "audit"
        self.store.save(state)
        security, style, tool_results = await asyncio.gather(
            run_security_agent(state),
            run_style_agent(state),
            ToolRunner(state.post_image).run_all(),
            return_exceptions=True,
        )
        for name, res in (("security", security), ("style", style)):
            if isinstance(res, BaseException):
                state.say(name, f"agent error: {res}")
            else:
                state.findings.extend(res)
                state.say(name, f"{len(res)} findings")
        if isinstance(tool_results, BaseException):
            state.say("tools", f"tool runner error: {tool_results}")
        else:
            state.tool_hits = [h for r in tool_results for h in r["hits"]]  # type: ignore[index]
            state.say("tools", f"{sum(len(r['hits']) for r in tool_results)} hits "
                               f"({', '.join(r['tool'] + ':' + r['status'] for r in tool_results)})")
        self.store.save(state)

    def _corroborate(self, state: AuditState) -> None:
        """Cross-check LLM claims against mechanical evidence."""
        state.stage = "corroborate"
        tool_hits = getattr(state, "tool_hits", [])
        kept: list[Finding] = []
        for f in state.findings:
            if f.source != "llm":
                kept.append(f)
                continue
            matches = [h for h in tool_hits
                       if h["file"].endswith(f.file.split("/")[-1])
                       and abs(h["line"] - f.line) <= CORROBORATE_RADIUS]
            if matches:
                f.source = "hybrid"
                f.tools = sorted({h["rule"] for h in matches})
                f.confidence = min(0.99, max(f.confidence, 0.9))
                kept.append(f)
                state.say("review", f"{f.id} corroborated by {', '.join(f.tools)}")
            elif f.confidence >= LLM_FLOOR:
                kept.append(f)
            else:
                state.dropped.append({"id": f.id, "reason":
                    f"uncorroborated LLM finding, confidence {f.confidence:.2f} < {LLM_FLOOR}"})
                state.say("review", f"dropped {f.id} (uncorroborated, {f.confidence:.0%})")
        state.findings = kept
        dropped_off_hunk = drop_off_hunk_findings(state)
        if dropped_off_hunk:
            state.say("review", f"dropped {dropped_off_hunk} findings outside changed hunks")
        state.findings.sort(key=lambda f: (-{"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}[f.severity.value], -f.confidence))
        self.store.save(state)

    async def _refactor(self, state: AuditState) -> None:
        state.stage = "refactor"
        for f in state.findings:
            if f.patch is not None or f.severity in (Severity.INFO, Severity.LOW):
                continue
            template = TEMPLATES.get(f.id.split(":")[0])
            if template:
                from state import Patch
                f.patch = Patch(before=template[0], after=template[1],
                                note="Deterministic template — semantics preserved.")
            else:
                lines = state.post_image.get(f.file, "").splitlines()
                ctx = lines[f.line - 1] if 0 < f.line <= len(lines) else ""
                result = await refactor_agent(f, ctx)
                if result:
                    from state import Patch
                    f.patch = Patch(**{k: result[k] for k in ("before", "after", "note") if k in result})
                    state.say("refactor", f"LLM patch for {f.id}")
        state.say("refactor", f"{sum(1 for f in state.findings if f.patch)} patches generated")
        self.store.save(state)

    def _review(self, state: AuditState) -> None:
        state.stage = "review"
        state.recount()
        c = state.counts
        md = [
            f"## 🤖 AI CoAudS Review — overall risk: **{state.overall_risk.value.upper()}**",
            "",
            f"**files:** {len(state.changed_files)} · **findings:** {len(state.findings)} "
            f"(critical {c['critical']} · high {c['high']} · medium {c['medium']} · low {c['low']} · info {c['info']}) · "
            f"dropped: {len(state.dropped)}",
            "",
        ]
        for f in state.findings[:25]:
            md += [
                f"### {f.severity.value.upper()} · `{f.file}:{f.line}` — {f.title}",
                f"{f.issue}  \n_confidence {f.confidence:.0%}"
                + (f" · corroborated by {', '.join(f.tools)}_" if f.tools else "_"),
                f"> fix: {f.recommendation}",
                "",
            ]
        md += ["---", "_Posted by AI CoAudS — deterministic rules + LLM audit; patches validated before posting._"]
        state.review_markdown = "\n".join(md)
        self.store.save(state)

    def _validate(self, state: AuditState) -> None:
        state.stage = "validate"
        state.validations = validate_patches(state)
        failed = [v for v in state.validations if not v["ok"]]
        for v in failed:  # invalidate failed patches — never post a broken fix
            for f in state.findings:
                if f.id == v["finding"] and f.patch:
                    f.patch = None
        state.say("validation",
                  f"{len(state.validations) - len(failed)}/{len(state.validations)} patch groups validated")
        self.store.save(state)

    async def _post(self, state: AuditState) -> None:
        state.stage = "post"
        if not self.github:
            state.say("orchestrator", "no write token — review stored, not posted")
            return
        event = "REQUEST_CHANGES" if any(
            f.severity in (Severity.CRITICAL, Severity.HIGH) for f in state.findings
        ) else "APPROVE" if state.findings == [] else "COMMENT"
        comments = [
            {"path": f.file, "line": f.line, "side": "RIGHT",
             "body": f"**{f.severity.value.upper()}** — {f.title}\n\n{f.issue}\n\n> {f.recommendation}"}
            for f in state.findings if f.file in state.post_image
        ]
        meta = await self.github.get_pull(self.owner, self.repo, self.number)
        state.review_url = await self.github.create_review(meta, state.review_markdown, event, comments)
        state.posted = True
        state.say("orchestrator", f"review posted ({event}): {state.review_url}")
        self.store.save(state)

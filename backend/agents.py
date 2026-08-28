"""AI CoAudS — specialist LLM agents.

Primary path: CrewAI crew with typed (pydantic) outputs, so an agent can
never free-form its way out of the schema. Fallback path: a direct
Anthropic call with the same JSON contract — the pipeline does not care
which produced the findings.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

from pydantic import BaseModel, Field

from state import Finding, Severity

log = logging.getLogger("coauds.agents")

LLM_MODEL = os.getenv("LLM_MODEL", "anthropic/claude-sonnet-4-5")
MAX_DIFF_CHARS = 24_000  # context budget per agent call


class FindingList(BaseModel):
    """Structured output contract for every audit agent."""

    findings: list[Finding] = Field(default_factory=list)


SECURITY_BRIEF = """You are the Security Agent of AI CoAudS, auditing a GitHub pull request.
Only report issues REACHABLE from the added lines. For each finding give:
file, line (new-file line number), severity (critical|high|medium|low|info),
confidence 0..1, cwe where applicable, title, issue (what is wrong, concretely),
recommendation (the fix). Look for: injection (SQL/shell/command), hardcoded
secrets, broken auth/crypto (MD5, weak PRNG, JWT verify bypass), unsafe
deserialization (pickle/yaml.load), disabled TLS verification, path traversal,
SSRF, debug endpoints, insecure defaults. Do NOT repeat style nits.
Prefer fewer, high-confidence findings over speculation."""

STYLE_BRIEF = """You are the Code Quality Agent of AI CoAudS, auditing a GitHub pull request.
Only report issues in the ADDED lines. Look for: excessive complexity, overly
long functions, duplicated logic, dead code, swallowed/bare exceptions,
mutable default arguments, misleading names, magic numbers, missing error
handling on I/O. For each finding: file, line, severity (mostly low|medium),
confidence 0..1, title, issue, recommendation. Skip formatting opinions a
linter already covers."""


def _trim(diff_text: str) -> str:
    if len(diff_text) <= MAX_DIFF_CHARS:
        return diff_text
    return diff_text[:MAX_DIFF_CHARS] + "\n…[truncated — audit what is visible]…"


def _diff_payload(state) -> str:
    parts = [f"PR: {state.repository}#{state.pr_number} — files: {', '.join(state.changed_files)}"]
    for f in state.changed_files:
        post = state.post_image.get(f)
        if post:
            parts.append(f"\n### {f}\n```python\n{post[:8000]}\n```")
    return _trim("\n".join(parts))


async def run_security_agent(state) -> list[Finding]:
    return await _run("security", SECURITY_BRIEF, state)


async def run_style_agent(state) -> list[Finding]:
    return await _run("style", STYLE_BRIEF, state)


async def _run(agent: str, brief: str, state) -> list[Finding]:
    payload = _diff_payload(state)
    try:
        return await _run_crew(agent, brief, payload)
    except Exception as exc:
        log.info("crewai unavailable for %s (%s) — direct API fallback", agent, exc)
        return await _run_direct(agent, brief, payload)


async def _run_crew(agent: str, brief: str, payload: str) -> list[Finding]:
    from crewai import Agent, Crew, Task  # imported lazily — optional dependency

    specialist = Agent(
        role=f"{agent} auditor",
        goal=brief,
        backstory="Senior application-security engineer reviewing untrusted diffs.",
        llm=LLM_MODEL,
        verbose=False,
    )
    task = Task(
        description=f"Audit this change set and return structured findings.\n\n{payload}",
        expected_output="JSON matching the FindingList schema",
        agent=specialist,
        output_pydantic=FindingList,
    )
    result = await Crew(agents=[specialist], tasks=[task], verbose=False).kickoff_async()
    parsed: FindingList = result.pydantic if hasattr(result, "pydantic") else FindingList()
    return [f.model_copy(update={"agent": agent, "source": "llm"}) for f in parsed.findings]


async def _run_direct(agent: str, brief: str, payload: str) -> list[Finding]:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    res = await client.messages.create(
        model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
        max_tokens=4096,
        system=brief + "\nRespond with ONLY a JSON object: {\"findings\": [...]}",
        messages=[{"role": "user", "content": payload}],
    )
    text = "".join(b.text for b in res.content if getattr(b, "type", "") == "text")
    data = _extract_json(text)
    parsed = FindingList.model_validate(data)
    return [f.model_copy(update={"agent": agent, "source": "llm"}) for f in parsed.findings]


def _extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in model output")
    return json.loads(text[start : end + 1])


async def refactor_agent(finding: Finding, context_line: str) -> Optional[dict]:
    """Ask the model for a minimal, behaviour-preserving patch."""
    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        res = await client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
            max_tokens=1024,
            system=(
                "You rewrite ONE vulnerable/problematic line into a safe replacement. "
                "Preserve behaviour and indentation. Reply with ONLY JSON: "
                '{"before": ..., "after": ..., "note": ...}'
            ),
            messages=[{
                "role": "user",
                "content": f"file: {finding.file}\nissue: {finding.issue}\nline: {context_line}",
            }],
        )
        text = "".join(b.text for b in res.content if getattr(b, "type", "") == "text")
        return _extract_json(text)
    except Exception as exc:
        log.warning("refactor agent failed for %s: %s", finding.id, exc)
        return None

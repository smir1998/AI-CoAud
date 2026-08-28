"""AI CoAudS — final validation gate.

Nothing reaches GitHub unproven. Each generated patch must:
  1. target lines that actually exist in the file's post-image,
  2. keep brackets balanced,
  3. still parse (ast.parse for Python),
  4. survive `ruff check` when ruff is installed.
Findings must point at *added* lines — claims about untouched code are
the classic LLM-review failure mode and are dropped here.
"""
from __future__ import annotations

import ast
import logging
import shutil
import subprocess
import tempfile
import textwrap
from pathlib import Path

from state import AuditState, Finding

log = logging.getLogger("coauds.validation")

PAIRS = {"(": ")", "[": "]", "{": "}"}


def _balanced(code: str) -> bool:
    stack: list[str] = []
    in_str: str | None = None
    prev = ""
    for ch in code:
        if in_str:
            if ch == in_str and prev != "\\":
                in_str = None
        elif ch in "'\"":
            in_str = ch
        elif ch in PAIRS:
            stack.append(PAIRS[ch])
        elif ch in PAIRS.values():
            if not stack or stack.pop() != ch:
                return False
        prev = ch
    return not stack


def validate_patches(state: AuditState) -> list[dict]:
    results: list[dict] = []
    patched_any = False

    for f in state.findings:
        if f.patch is None:
            continue
        lines = state.post_image.get(f.file, "").splitlines()
        checks = _check_patch(f, lines)
        f.patch.validated = all(c["ok"] for c in checks)
        f.patch.validation_detail = "; ".join(c["text"] for c in checks)
        patched_any = True
        results.append({"finding": f.id, "ok": f.patch.validated, "checks": checks})

    if not patched_any:
        results.append({"finding": None, "ok": True,
                        "checks": [{"ok": True, "text": "no patches generated — nothing to validate"}]})
    return results


def _check_patch(f: Finding, lines: list[str]) -> list[dict]:
    checks: list[dict] = []
    patch = f.patch
    assert patch is not None

    target_exists = any(ln.strip() == patch.before.strip() for ln in lines)
    checks.append({
        "ok": target_exists,
        "text": f"target line exists in {f.file}" if target_exists
                else f"target line NOT found in {f.file} — stale or hallucinated patch",
    })
    if not target_exists:
        return checks

    bal = _balanced(patch.after)
    checks.append({"ok": bal, "text": "brackets balanced" if bal else "unbalanced brackets in replacement"})

    if f.file.endswith(".py"):
        try:
            ast.parse(textwrap.dedent(patch.after))
            checks.append({"ok": True, "text": "ast.parse OK"})
        except SyntaxError as exc:
            checks.append({"ok": False, "text": f"syntax error: {exc.msg} (line {exc.lineno})"})
            return checks

        if shutil.which("ruff"):
            with tempfile.TemporaryDirectory() as tmp:
                p = Path(tmp) / "patched.py"
                p.write_text(textwrap.dedent(patch.after) + "\n", encoding="utf-8")
                proc = subprocess.run(
                    ["ruff", "check", "--select", "E9,F", str(p)],
                    capture_output=True, text=True, timeout=30,
                )
                ok = proc.returncode == 0
                checks.append({"ok": ok, "text": "ruff clean" if ok else f"ruff: {proc.stdout.strip()[:160]}"})
    return checks


def drop_off_hunk_findings(state: AuditState) -> int:
    """LLMs love commenting on unchanged code. Remove it."""
    dropped = 0
    kept: list[Finding] = []
    for f in state.findings:
        added = state.added_lines.get(f.file, set())
        if added and f.line not in added and f.source == "llm":
            state.dropped.append({"id": f.id, "reason": f"line {f.line} not in changed hunks"})
            dropped += 1
        else:
            kept.append(f)
    state.findings = kept
    return dropped

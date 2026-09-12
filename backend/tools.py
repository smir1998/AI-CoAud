"""AI CoAudS — deterministic static analysis layer.

Runs real scanners as subprocesses against the PR's post-image files
(materialised in a temp dir), with hard timeouts. A missing binary is a
*skip*, never a failure — the LLM agents still run, but findings lose
their corroboration signal.

Every tool result is normalised into (tool_id, finding dicts) so the
pipeline can cross-check LLM claims against mechanical evidence.
"""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

log = logging.getLogger("coauds.tools")

TOOL_TIMEOUT = 90  # seconds per tool, hard cap
SEV_MAP = {"ERROR": "high", "WARNING": "medium", "INFO": "low",
           "HIGH": "high", "MEDIUM": "medium", "LOW": "low"}


async def _run(cmd: list[str], cwd: str | None = None) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.PIPE,
        stderr=asyncio.PIPE,
        cwd=cwd,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), TOOL_TIMEOUT)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise TimeoutError(f"{cmd[0]} exceeded {TOOL_TIMEOUT}s")
    return proc.returncode or 0, out.decode(errors="replace"), err.decode(errors="replace")


class ToolRunner:
    def __init__(self, files: dict[str, str], requirements: str | None = None):
        self.files = files            # relative path -> post-image content
        self.requirements = requirements
        self.tmp = tempfile.TemporaryDirectory(prefix="coauds-")
        for rel, content in files.items():
            p = Path(self.tmp.name) / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")

    def cleanup(self) -> None:
        self.tmp.cleanup()

    async def run_all(self) -> list[dict]:
        """Returns [{tool, status: ok|skipped|timeout|error, hits: [...], ms}]"""
        jobs = [
            ("semgrep", self._semgrep),
            ("bandit", self._bandit),
            ("ruff", self._ruff),
            ("pip-audit", self._pip_audit),
        ]
        results = await asyncio.gather(*(self._wrap(name, fn) for name, fn in jobs))
        return list(results)

    async def _wrap(self, name: str, fn) -> dict:
        t0 = time.time()
        if shutil.which(name.split()[0]) is None:
            log.info("%s not installed — skipped", name)
            return {"tool": name, "status": "skipped", "hits": [], "ms": 0}
        try:
            hits = await fn()
            log.info("%s: %d hits in %.0fms", name, len(hits), (time.time() - t0) * 1e3)
            return {"tool": name, "status": "ok", "hits": hits, "ms": int((time.time() - t0) * 1e3)}
        except TimeoutError:
            return {"tool": name, "status": "timeout", "hits": [], "ms": TOOL_TIMEOUT * 1000}
        except Exception as exc:  # never let a tool kill the audit
            log.warning("%s failed: %s", name, exc)
            return {"tool": name, "status": "error", "hits": [], "ms": 0}

    async def _semgrep(self) -> list[dict]:
        rc, out, _ = await _run(
            ["semgrep", "scan", "--config", "auto", "--metrics=off", "--json", "--quiet", "."],
            cwd=self.tmp.name,
        )
        if rc not in (0, 1):  # 1 = findings present
            raise RuntimeError(f"semgrep rc={rc}")
        data = json.loads(out or "{}")
        return [
            {
                "file": r["path"], "line": r["start"]["line"],
                "severity": SEV_MAP.get(r.get("extra", {}).get("severity", ""), "medium"),
                "rule": r["check_id"], "message": r.get("extra", {}).get("message", "")[:400],
            }
            for r in data.get("results", [])
        ]

    async def _bandit(self) -> list[dict]:
        py = [p for p in self.files if p.endswith(".py")]
        if not py:
            return []
        rc, out, _ = await _run(["bandit", "-r", "-f", "json", "-q", "."], cwd=self.tmp.name)
        if rc not in (0, 1):
            raise RuntimeError(f"bandit rc={rc}")
        data = json.loads(out or "{}")
        return [
            {
                "file": Path(r["filename"]).name if "/" not in r["filename"] else r["filename"],
                "line": r["line_number"],
                "severity": r["issue_severity"].lower(),
                "rule": r["test_id"], "message": r["issue_text"][:400],
                "confidence": r["issue_confidence"].lower(),
            }
            for r in data.get("results", [])
        ]

    async def _ruff(self) -> list[dict]:
        rc, out, _ = await _run(["ruff", "check", "--output-format", "json", "."], cwd=self.tmp.name)
        if rc not in (0, 1):
            raise RuntimeError(f"ruff rc={rc}")
        return [
            {"file": r["filename"], "line": r["location"]["row"],
             "severity": "low", "rule": r["code"], "message": r["message"][:400]}
            for r in json.loads(out or "[]")
        ]

    async def _pip_audit(self) -> list[dict]:
        if not self.requirements:
            return []
        req = Path(self.tmp.name) / "requirements.lock"
        req.write_text(self.requirements, encoding="utf-8")
        rc, out, _ = await _run(
            ["pip-audit", "-r", "requirements.lock", "--format", "json", "--progress-spinner", "off"],
            cwd=self.tmp.name,
        )
        if rc not in (0, 1):
            raise RuntimeError(f"pip-audit rc={rc}")
        data: Any = json.loads(out or "[]")
        hits = []
        for dep in data if isinstance(data, list) else data.get("dependencies", []):
            for v in dep.get("vulns", []):
                hits.append({
                    "file": "requirements.txt", "line": 1, "severity": "high",
                    "rule": v.get("id", "CVE"), "message":
                        f"{dep['name']}=={dep['version']}: {v.get('id')} — {v.get('description', '')[:300]}",
                })
        return hits

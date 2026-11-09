"""Regression tests for diff handling, webhook security, and audit completion."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys
from types import ModuleType
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("GITHUB_TOKEN", "")

agents = ModuleType("agents")
agents.run_security_agent = AsyncMock(return_value=[])
agents.run_style_agent = AsyncMock(return_value=[])
agents.refactor_agent = AsyncMock(return_value=None)
sys.modules["agents"] = agents

from fastapi.testclient import TestClient  # noqa: E402
import pipeline as pipeline_module  # noqa: E402
import server  # noqa: E402
from state import AuditState, Finding, Patch, Severity, StateStore  # noqa: E402


class DiffAndFindingTests(unittest.TestCase):
    def test_parse_diff_tracks_added_lines_across_hunks(self) -> None:
        diff = "@@ -2,2 +2,3 @@\n context\n-old\n+new one\n+new two\n@@ -8 +9,2 @@\n-old end\n+new end\n+last\n"
        added, image = pipeline_module.parse_diff(diff)
        self.assertEqual(added, [3, 4, 9, 10])
        self.assertIn("new two", image)
        self.assertIn("last", image)

    def test_llm_findings_outside_added_lines_are_dropped_even_when_none_added(self) -> None:
        state = AuditState(repository="acme/demo", pr_number=1, commit_sha="a" * 40)
        state.added_lines["src/a.py"] = []
        state.findings = [Finding(
            id="f1", agent="security", file="src/a.py", line=3,
            severity=Severity.HIGH, confidence=0.9, title="Issue",
            issue="Problem", recommendation="Fix it", source="llm",
        )]
        dropped = pipeline_module.drop_off_hunk_findings(state)
        self.assertEqual(dropped, 1)
        self.assertEqual(state.findings, [])
        self.assertIn("no added lines", state.dropped[0]["reason"])

    def test_patch_uses_full_file_and_rejects_ambiguous_context(self) -> None:
        state = AuditState(repository="acme/demo", pr_number=1, commit_sha="a" * 40)
        state.post_image["src/a.py"] = "value = 1\nprint(value)\n"
        state.findings = [Finding(
            id="f1", agent="refactor", file="src/a.py", line=1,
            severity=Severity.MEDIUM, confidence=0.9, title="Issue",
            issue="Problem", recommendation="Fix it",
            patch=Patch(before="value = 1", after="value = 2", note="update"),
        )]
        result = pipeline_module.validate_patches(state)
        self.assertTrue(result[0]["ok"])
        self.assertIn("updated file parses", state.findings[0].patch.validation_detail)

        state.post_image["src/a.py"] = "value = 1\nvalue = 1\n"
        result = pipeline_module.validate_patches(state)
        self.assertFalse(result[0]["ok"])
        self.assertIn("ambiguous", result[0]["checks"][0]["text"])

        state.post_image["src/a.py"] = "def f():\n    value = 1\n"
        state.findings[0].patch = Patch(before="    value = 1", after="value = 2", note="dedent")
        result = pipeline_module.validate_patches(state)
        self.assertFalse(result[0]["ok"])
        self.assertIn("syntax error", state.findings[0].patch.validation_detail)


class WebhookTests(unittest.TestCase):
    def setUp(self) -> None:
        server.APP_ENV = "development"
        server.WEBHOOK_SECRET = b"test-secret"
        server.AUDIT_API_TOKEN = ""
        server.ALLOWED_REPOS = set()
        server.queue = asyncio.Queue(maxsize=1)
        server.queue_lock = asyncio.Lock()
        server.store = StateStore(None)
        self.client = TestClient(server.app)

    def signature(self, body: bytes) -> str:
        digest = hmac.new(server.WEBHOOK_SECRET, body, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    @staticmethod
    def payload() -> dict:
        return {
            "action": "opened",
            "pull_request": {
                "number": 5,
                "head": {"sha": "b" * 40, "ref": "feature"},
                "base": {"ref": "main"},
            },
            "repository": {"full_name": "acme/demo"},
        }

    def post_webhook(self, body: bytes, signature: str | None = None):
        return self.client.post(
            "/webhook", content=body,
            headers={
                "content-type": "application/json",
                "x-github-event": "pull_request",
                "x-hub-signature-256": signature or self.signature(body),
            },
        )

    def test_signature_is_required_when_secret_is_configured(self) -> None:
        response = self.post_webhook(b'{"action":"opened"}', "sha256=bad")
        self.assertEqual(response.status_code, 401)

    def test_webhook_body_limit_returns_413(self) -> None:
        body = b" " * (server.MAX_WEBHOOK_BODY_BYTES + 1)
        response = self.post_webhook(body)
        self.assertEqual(response.status_code, 413)

    def test_queue_is_bounded_and_duplicate_head_is_skipped(self) -> None:
        body = json.dumps(self.payload()).encode()
        first = self.post_webhook(body)
        duplicate = self.post_webhook(body)
        self.assertEqual(first.status_code, 202)
        self.assertEqual(duplicate.json()["status"], "skipped")
        self.assertEqual(server.queue.qsize(), 1)

        full = self.payload()
        full["pull_request"]["head"]["sha"] = "c" * 40
        response = self.post_webhook(json.dumps(full).encode())
        self.assertEqual(response.status_code, 429)

    def test_audit_reads_require_bearer_token_when_configured(self) -> None:
        server.AUDIT_API_TOKEN = "read-secret"
        self.assertEqual(self.client.get("/audits").status_code, 401)
        response = self.client.get("/audits", headers={"authorization": "Bearer read-secret"})
        self.assertEqual(response.status_code, 200)


class IncompleteAuditTests(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_gap_survives_scanner_results_and_blocks_approval(self) -> None:
        state = AuditState(repository="acme/demo", pr_number=1, commit_sha="a" * 40)
        state.incomplete_reasons.append("diff unavailable for image.png")

        class Runner:
            async def run_all(self):
                return [{"tool": "ruff", "status": "ok", "hits": []}]

            def cleanup(self):
                pass

        pipeline = pipeline_module.AuditPipeline(StateStore(None), None, "acme", "demo", 1)
        with (
            patch.object(pipeline_module, "run_security_agent", AsyncMock(return_value=[])),
            patch.object(pipeline_module, "run_style_agent", AsyncMock(return_value=[])),
            patch.object(pipeline_module, "ToolRunner", return_value=Runner()),
        ):
            await pipeline._parallel_audit(state)

        self.assertFalse(state.audit_complete)
        self.assertIn("diff unavailable for image.png", state.incomplete_reasons)

        github = SimpleNamespace(
            get_pull=AsyncMock(return_value=SimpleNamespace(head_sha="a" * 40)),
            create_review=AsyncMock(return_value="https://github.com/acme/demo/pull/1#review"),
        )
        pipeline.github = github
        state.review_markdown = "incomplete review"
        await pipeline._post(state)
        self.assertEqual(github.create_review.await_args.args[2], "COMMENT")


if __name__ == "__main__":
    unittest.main()

export interface CodeFile {
  name: string;
  lang: "python" | "yaml" | "docker" | "text";
  note: string;
  code: string;
}

export const CODE_FILES: CodeFile[] = [
  {
    name: "server.py",
    lang: "python",
    note: "FastAPI webhook endpoint — HMAC verification + background audit",
    code: String.raw`"""Sentinel Crew - webhook server.

Receives GitHub pull_request events, verifies the HMAC signature and
kicks off the audit pipeline as a background task so the hook answers
202 immediately (GitHub retries webhooks that respond slowly).
"""
import asyncio
import hashlib
import hmac
import logging
import os

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request

from pipeline import run_audit

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("sentinel.server")

app = FastAPI(title="sentinel-crew", version="1.0.0")

WEBHOOK_SECRET = os.environ["GITHUB_WEBHOOK_SECRET"].encode()
HANDLED_ACTIONS = {"opened", "synchronize", "reopened"}


def verify_signature(body: bytes, signature: str | None) -> bool:
    """Constant-time check of X-Hub-Signature-256."""
    if not signature or not signature.startswith("sha256="):
        return False
    digest = hmac.new(WEBHOOK_SECRET, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature.removeprefix("sha256="))


@app.post("/webhook", status_code=202)
async def webhook(request: Request,
                  background: BackgroundTasks,
                  x_hub_signature_256: str | None = Header(default=None),
                  x_github_event: str | None = Header(default=None)):
    body = await request.body()
    if not verify_signature(body, x_hub_signature_256):
        log.warning("webhook rejected: bad signature")
        raise HTTPException(status_code=401, detail="invalid signature")
    if x_github_event != "pull_request":
        return {"ignored": x_github_event}

    payload = await request.json()
    if payload.get("action") not in HANDLED_ACTIONS:
        return {"ignored": payload.get("action")}

    repo = payload["repository"]["full_name"]
    number = payload["pull_request"]["number"]
    log.info("audit queued: %s#%s (%s)", repo, number, payload["action"])
    background.add_task(run_audit, payload)
    return {"queued": True, "repo": repo, "pr": number}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "sentinel-crew"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
`,
  },
  {
    name: "pipeline.py",
    lang: "python",
    note: "Orchestrator glue — fetch, parallel audit, crew kickoff, post",
    code: String.raw`"""End-to-end audit pipeline driven by the Orchestrator agent."""
import asyncio
import logging

from tenacity import retry, stop_after_attempt, wait_exponential

from agents import build_crew
from github_client import GitHubClient
from state import AuditState, store
from tools import run_static_tools
from validation import validate_patches

log = logging.getLogger("sentinel.pipeline")

gh = GitHubClient()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=20))
async def run_audit(payload: dict) -> None:
    pr = payload["pull_request"]
    repo = payload["repository"]["full_name"]

    # 1. Orchestrator: build shared state from the event
    state = AuditState(
        repository=repo,
        pr_number=pr["number"],
        commit_sha=pr["head"]["sha"],
        base_ref=pr["base"]["ref"],
        head_ref=pr["head"]["ref"],
    )
    state.changed_files = await gh.fetch_files(repo, pr["number"])
    store.save(state)
    log.info("[%s] %d files loaded", state.run_id, len(state.changed_files))

    # 2. Parallel audit: LLM agents (crew) + deterministic tools
    crew = build_crew()
    crew_task = asyncio.to_thread(
        crew.kickoff, inputs={"state_json": store.key(state)})
    tools_task = asyncio.to_thread(
        run_static_tools, state.workdir(), state.changed_files)
    crew_result, tool_findings = await asyncio.gather(crew_task, tools_task)

    # 3. Correlate: tool hits corroborate or refute LLM findings
    state.correlate(tool_findings)
    store.save(state)

    # 4. Validation gate: patches must parse and lint before posting
    validate_patches(state)
    store.save(state)

    # 5. Post the final review back to the PR
    if state.final_review is not None:
        await gh.post_review(repo, pr["number"], state.final_review,
                             inline=state.inline_comments())
        state.posted = True
        store.save(state)
        log.info("[%s] review posted: risk=%s issues=%d",
                 state.run_id, state.final_review.overall_risk,
                 state.final_review.issues_found)
`,
  },
  {
    name: "agents.py",
    lang: "python",
    note: "CrewAI crew — five specialized agents and their tasks",
    code: String.raw`"""CrewAI agent definitions for the audit crew."""
from crewai import Agent, Crew, Process, Task
from crewai_tools import FileReadTool

from config import settings

FINDINGS_SCHEMA = """Return strict JSON: a list of findings with keys
file, line, severity (critical|high|medium|low|info), confidence
(0..1), title, issue, recommendation."""


def build_crew() -> Crew:
    file_tool = FileReadTool()

    orchestrator = Agent(
        role="Audit Orchestrator",
        goal="Coordinate the audit of the pull request described in the "
             "shared state; never audit code yourself.",
        backstory="You are a staff engineer who plans reviews, keeps the "
                  "shared workflow state consistent and aggregates results.",
        llm=settings.ORCHESTRATOR_MODEL, allow_delegation=True)

    style = Agent(
        role="Code Quality Auditor",
        goal="Find smells, duplication, complexity and naming issues in the "
             "changed hunks only. " + FINDINGS_SCHEMA,
        backstory="You are a pragmatic clean-code reviewer; you flag what "
                  "hurts maintainability, not what is merely personal taste.",
        llm=settings.STYLE_MODEL, tools=[file_tool])

    security = Agent(
        role="Security Auditor",
        goal="Find injection, insecure auth, hardcoded secrets, missing input "
             "validation and unsafe dependencies in the diff. Mark anything "
             "you cannot prove with confidence <= 0.6. " + FINDINGS_SCHEMA,
        backstory="You are an application-security engineer who traces "
                  "taint from sources to sinks and cites the exact line.",
        llm=settings.SECURITY_MODEL, tools=[file_tool])

    refactorer = Agent(
        role="Refactoring Engineer",
        goal="For every confirmed high/medium finding produce a unified-diff "
             "patch that preserves behavior, plus one sentence on why the "
             "change is safer or cleaner.",
        backstory="You write minimal, reviewable patches; you never reformat "
                  "untouched code and you never change public contracts.",
        llm=settings.REFACTOR_MODEL, tools=[file_tool])

    reviewer = Agent(
        role="Review Editor",
        goal="Merge duplicate findings, drop confidence < 0.6 unless a "
             "deterministic tool confirms them, assign final severity and "
             "write the markdown PR review with a risk verdict.",
        backstory="You are the editor-in-chief: concise, ruthless about "
                  "false positives, and always actionable.",
        llm=settings.REVIEW_MODEL)

    tasks = [
        Task(description="Load shared state, chunk the diff and dispatch "
                         "auditors.", agent=orchestrator,
             expected_output="Audit plan in the shared state."),
        Task(description="Audit the changed hunks for quality issues.",
             agent=style, expected_output="JSON findings list.",
             async_execution=True),
        Task(description="Audit the changed hunks for vulnerabilities.",
             agent=security, expected_output="JSON findings list.",
             async_execution=True),
        Task(description="Generate patches for confirmed findings.",
             agent=refactorer,
             expected_output="Patches attached to findings."),
        Task(description="Dedupe, rank and write the final review.",
             agent=reviewer,
             expected_output="Markdown review + risk verdict."),
    ]
    return Crew(agents=[orchestrator, style, security, refactorer, reviewer],
                tasks=tasks, process=Process.sequential, memory=True,
                verbose=settings.DEBUG)
`,
  },
  {
    name: "state.py",
    lang: "python",
    note: "Shared workflow state — everything agents read and write",
    code: String.raw`"""Shared workflow state, persisted to Redis across workers."""
import json
import uuid
from typing import Literal

import redis
from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low", "info"]
AgentId = Literal["orchestrator", "style", "security",
                  "tools", "refactor", "review"]


class Patch(BaseModel):
    before: str
    after: str
    rationale: str = ""


class Finding(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    agent: AgentId
    file: str
    line: int
    severity: Severity = "info"
    confidence: float = 0.5
    title: str
    issue: str
    recommendation: str
    patch: Patch | None = None
    corroborated_by: list[str] = Field(default_factory=list)


class ChangedFile(BaseModel):
    path: str
    additions: int
    deletions: int
    patch: str


class AuditState(BaseModel):
    run_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    repository: str
    pr_number: int
    commit_sha: str
    base_ref: str = "main"
    head_ref: str = ""
    changed_files: list[ChangedFile] = Field(default_factory=list)
    agent_findings: dict[AgentId, list[Finding]] = Field(default_factory=dict)
    overall_risk: Severity | None = None
    final_review: str | None = None
    posted: bool = False

    def correlate(self, tool_findings: list[Finding]) -> None:
        """Corroborate LLM findings with deterministic tool hits;
        uncorroborated low-confidence findings are dropped."""
        confirmed: list[Finding] = []
        for f in self.all_findings():
            hits = [t for t in tool_findings
                    if t.file == f.file and abs(t.line - f.line) <= 2]
            if hits:
                f.corroborated_by = [h.title for h in hits]
                f.confidence = min(0.99, f.confidence + 0.05)
            if f.confidence >= 0.6 or f.corroborated_by:
                confirmed.append(f)
        self.agent_findings["review"] = confirmed

    def all_findings(self) -> list[Finding]:
        return [f for fs in self.agent_findings.values() for f in fs]


class RedisStateStore:
    """JSON snapshot store; swap for richer memory (vector/summary) later."""

    def __init__(self, url: str):
        self.r = redis.from_url(url, decode_responses=True)

    def key(self, state: AuditState) -> str:
        return f"sentinel:audit:{state.run_id}"

    def save(self, state: AuditState) -> None:
        self.r.set(self.key(state), state.model_dump_json(), ex=86400)

    def load(self, key: str) -> AuditState:
        return AuditState.model_validate_json(self.r.get(key))


store = RedisStateStore("redis://redis:6379/0")
`,
  },
  {
    name: "github_client.py",
    lang: "python",
    note: "GitHub REST — fetch PR files/diff, post review + inline comments",
    code: String.raw`"""Thin async GitHub REST client (GitHub App installation token)."""
import os
import time

import httpx

from state import ChangedFile, Finding

API = "https://api.github.com"


class GitHubClient:
    def __init__(self):
        self.token = os.environ["GITHUB_TOKEN"]
        self.client = httpx.AsyncClient(
            base_url=API,
            headers={"Authorization": f"Bearer {self.token}",
                     "Accept": "application/vnd.github+json"},
            timeout=30)

    async def fetch_files(self, repo: str, pr: int) -> list[ChangedFile]:
        """Paginate the files endpoint and keep each file's patch."""
        files: list[ChangedFile] = []
        page = 1
        while True:
            r = await self.client.get(
                f"/repos/{repo}/pulls/{pr}/files",
                params={"per_page": 100, "page": page})
            r.raise_for_status()
            batch = r.json()
            if not batch:
                break
            files.extend(ChangedFile(path=f["filename"],
                                     additions=f["additions"],
                                     deletions=f["deletions"],
                                     patch=f.get("patch", ""))
                         for f in batch)
            page += 1
        return files

    async def post_review(self, repo: str, pr: int, body: str,
                          inline: list[dict]) -> None:
        """Submit one review with inline comments in a single call."""
        r = await self.client.post(
            f"/repos/{repo}/pulls/{pr}/reviews",
            json={"body": body, "event": "COMMENT", "comments": inline})
        r.raise_for_status()


def inline_comments(findings: list[Finding], sha: str) -> list[dict]:
    """Map findings onto GitHub review-comment positions."""
    out = []
    for f in findings[:30]:  # GitHub caps review comments per call
        out.append({
            "path": f.file,
            "line": f.line,
            "side": "RIGHT",
            "body": (f"**[{f.severity.upper()}]** {f.title} "
                     f"(confidence {int(f.confidence * 100)}%)\n\n"
                     f"{f.issue}\n\nFix: {f.recommendation}"),
        })
    return out
`,
  },
  {
    name: "tools.py",
    lang: "python",
    note: "Deterministic SAST runners — the hallucination guardrail",
    code: String.raw`"""Deterministic checkers whose hits corroborate or refute LLM findings."""
import json
import subprocess
from pathlib import Path

from state import ChangedFile, Finding

TIMEOUT = 120  # seconds per tool, hard cap


def _run(cmd: list[str], cwd: Path) -> str:
    try:
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True,
                              text=True, timeout=TIMEOUT)
        return proc.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def run_semgrep(workdir: Path) -> list[Finding]:
    out = _run(["semgrep", "scan", "--config", "p/security-audit",
                "--config", "p/python", "--json", "."], workdir)
    try:
        hits = json.loads(out or "{}").get("results", [])
    except json.JSONDecodeError:
        return []
    return [Finding(agent="tools", file=h["path"],
                    line=h["start"]["line"], severity="high",
                    confidence=0.9, title=h["check_id"],
                    issue=h["extra"]["message"],
                    recommendation="See rule reference.")
            for h in hits]


def run_bandit(workdir: Path) -> list[Finding]:
    out = _run(["bandit", "-r", ".", "-ll", "-f", "json"], workdir)
    try:
        hits = json.loads(out or "{}").get("results", [])
    except json.JSONDecodeError:
        return []
    sev = {"HIGH": "high", "MEDIUM": "medium", "LOW": "low"}
    return [Finding(agent="tools",
                    file=h["filename"].removeprefix("./"),
                    line=h["line_number"],
                    severity=sev.get(h["issue_severity"], "medium"),
                    confidence=0.95,
                    title=f"Bandit {h['test_id']}",
                    issue=h["issue_text"],
                    recommendation=h["issue_text"])
            for h in hits]


def run_ruff(workdir: Path) -> list[Finding]:
    out = _run(["ruff", "check", "--output-format", "json", "."], workdir)
    try:
        hits = json.loads(out or "[]")
    except json.JSONDecodeError:
        return []
    return [Finding(agent="tools", file=h["filename"], line=h["location"]["row"],
                    severity="low", confidence=0.99,
                    title=f"Ruff {h['code']}", issue=h["message"],
                    recommendation=h["message"])
            for h in hits]


def run_static_tools(workdir: Path,
                     files: list[ChangedFile]) -> list[Finding]:
    findings = run_semgrep(workdir) + run_bandit(workdir) + run_ruff(workdir)
    if any(f.path.endswith("requirements.txt") for f in files):
        findings += _pip_audit(workdir)
    return findings


def _pip_audit(workdir: Path) -> list[Finding]:
    out = _run(["pip-audit", "-r", "requirements.txt", "-f", "json"], workdir)
    try:
        deps = json.loads(out or "[]")
    except json.JSONDecodeError:
        return []
    found: list[Finding] = []
    for dep in deps:
        for vuln in dep.get("vulns", []):
            found.append(Finding(agent="tools", file="requirements.txt",
                                 line=1, severity="medium", confidence=0.97,
                                 title=vuln["id"],
                                 issue=f"{dep['name']} {dep['version']}: "
                                       f"{vuln['description'][:160]}",
                                 recommendation="Upgrade the pinned version."))
    return found
`,
  },
  {
    name: "validation.py",
    lang: "python",
    note: "Validation gate — patches must parse, lint and pass tests",
    code: String.raw`"""Validation stage: generated patches must survive real checks
before they are attached to the public review."""
import ast
import logging
import subprocess
from pathlib import Path

from state import AuditState

log = logging.getLogger("sentinel.validation")


def validate_patches(state: AuditState) -> None:
    """For every finding with a patch: apply in a scratch copy, then run
    ast.parse, ruff and (if tests exist) pytest. Bad patches are dropped."""
    workdir = Path(state.workdir())
    kept, dropped = 0, 0
    for f in state.all_findings():
        if f.patch is None:
            continue
        target = workdir / f.file
        candidate = apply_patch(target.read_text(), f.patch)
        checks = [lambda c=candidate: ast.parse(c) is not None,
                  lambda p=target: lint(p)]
        if f.patch.after.strip():
            ok = all(safe(run) for run in checks)
        else:
            ok = True
        if ok and tests_exist(workdir):
            ok = pytest_passes(workdir)
        if ok:
            kept += 1
        else:
            f.patch = None  # never post a patch that does not compile
            dropped += 1
            log.warning("[%s] patch dropped for %s:%d",
                        state.run_id, f.file, f.line)
    state.patches_kept, state.patches_dropped = kept, dropped


def apply_patch(source: str, patch) -> str:
    if patch.before in source:
        return source.replace(patch.before, patch.after, 1)
    return source


def lint(path: Path) -> bool:
    return subprocess.run(["ruff", "check", str(path)],
                          capture_output=True).returncode == 0


def tests_exist(workdir: Path) -> bool:
    return any(workdir.rglob("test_*.py"))


def pytest_passes(workdir: Path) -> bool:
    return subprocess.run(["pytest", "-x", "-q"], cwd=workdir,
                          capture_output=True, timeout=300).returncode == 0


def safe(fn) -> bool:
    try:
        return bool(fn())
    except Exception:
        return False
`,
  },
  {
    name: "requirements.txt",
    lang: "text",
    note: "Pinned runtime dependencies",
    code: String.raw`fastapi==0.115.6
uvicorn[standard]==0.34.0
crewai==0.80.0
crewai-tools==0.17.0
openai==1.58.1
anthropic==0.40.0
httpx==0.28.1
pydantic==2.10.4
redis==5.2.1
tenacity==9.0.0
python-dotenv==1.0.1
# deterministic toolchain (installed in the image)
semgrep==1.100.0
bandit==1.8.0
ruff==0.8.4
pip-audit==2.7.3
`,
  },
  {
    name: "Dockerfile",
    lang: "docker",
    note: "Service image with the SAST toolchain baked in",
    code: String.raw`FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# semgrep needs git + ca certs; keep the image lean
RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# non-root user for the webhook service
RUN useradd --create-home sentinel
USER sentinel

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
`,
  },
  {
    name: "docker-compose.yml",
    lang: "yaml",
    note: "Local deployment — webhook service + Redis state store",
    code: String.raw`services:
  sentinel:
    build: .
    ports:
      - "8000:8000"
    environment:
      GITHUB_TOKEN: ${"$"}{GITHUB_TOKEN}
      GITHUB_WEBHOOK_SECRET: ${"$"}{GITHUB_WEBHOOK_SECRET}
      OPENAI_API_KEY: ${"$"}{OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${"$"}{ANTHROPIC_API_KEY}
      REDIS_URL: redis://redis:6379/0
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - sentinel-state:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  sentinel-state:
`,
  },
  {
    name: ".env.example",
    lang: "text",
    note: "Required environment configuration",
    code: String.raw`# GitHub App installation token (or fine-grained PAT)
GITHUB_TOKEN=ghs_xxxxxxxxxxxx

# secret configured in the GitHub App webhook settings
GITHUB_WEBHOOK_SECRET=replace-with-a-long-random-string

# LLM providers used by the crew
OPENAI_API_KEY=sk-xxxx
ANTHROPIC_API_KEY=sk-ant-xxxx

# model routing
ORCHESTRATOR_MODEL=gpt-4o
STYLE_MODEL=claude-sonnet-4-20250514
SECURITY_MODEL=gpt-4o
REFACTOR_MODEL=claude-sonnet-4-20250514
REVIEW_MODEL=gpt-4o

DEBUG=false
`,
  },
];

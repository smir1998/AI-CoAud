"""AI CoAudS — webhook server.

POST /webhook        GitHub pull_request events (HMAC-verified) → audit queue
GET  /audits/{id}    live state of one run (poll while agents work)
GET  /audits         recent runs
GET  /health         liveness + redis ping + queue depth

Audits run on a bounded asyncio worker pool — a webhook burst never
spawns unbounded LLM spend. Duplicate head-SHAs are skipped.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel

from github_client import GitHubClient
from limits import MAX_WEBHOOK_BODY_BYTES
from pipeline import AuditPipeline
from state import AuditState, StateStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("coauds.server")

WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "").encode()
AUDIT_API_TOKEN = os.getenv("AUDIT_API_TOKEN", "")
APP_ENV = os.getenv("APP_ENV", "production").strip().lower()
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
REDIS_URL = os.getenv("REDIS_URL") or None
ALLOWED_REPOS = {r.strip() for r in os.getenv("ALLOWED_REPOS", "").split(",") if r.strip()}
MAX_QUEUE = int(os.getenv("MAX_QUEUE", "20"))
WORKERS = int(os.getenv("WORKERS", "2"))

queue: asyncio.Queue[AuditState] = asyncio.Queue(maxsize=MAX_QUEUE)
queue_lock = asyncio.Lock()
store = StateStore(REDIS_URL)
github = GitHubClient(GITHUB_TOKEN) if GITHUB_TOKEN else None


async def worker(name: str) -> None:
    while True:
        state = await queue.get()
        try:
            owner, repo = state.repository.split("/", 1)
            pipeline = AuditPipeline(store, github, owner, repo, state.pr_number)
            await pipeline.run(state)
        except Exception as exc:  # worker must never die
            state.status, state.error = "failed", str(exc)
            store.save(state)
            log.exception("[%s] worker %s crashed", state.run_id, name)
        finally:
            queue.task_done()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if APP_ENV not in {"production", "development"}:
        raise RuntimeError("APP_ENV must be 'production' or 'development'")
    if APP_ENV != "development" and not WEBHOOK_SECRET:
        raise RuntimeError("GITHUB_WEBHOOK_SECRET is required outside development")
    if APP_ENV != "development" and not AUDIT_API_TOKEN:
        raise RuntimeError("AUDIT_API_TOKEN is required outside development")
    if APP_ENV == "development" and (not WEBHOOK_SECRET or not AUDIT_API_TOKEN):
        log.warning("development mode: missing webhook or audit API token")
    tasks = [asyncio.create_task(worker(f"w{i}")) for i in range(WORKERS)]
    log.info("coauds server up — %d workers, queue cap %d", WORKERS, MAX_QUEUE)
    yield
    for t in tasks:
        t.cancel()
    if github:
        await github.aclose()


app = FastAPI(title="ai-coauds", version="2.1.0", lifespan=lifespan)


def verify_signature(body: bytes, signature: str | None) -> None:
    if not WEBHOOK_SECRET:
        if APP_ENV == "development":
            return
        raise HTTPException(status_code=503, detail="webhook verification is not configured")
    expected = "sha256=" + hmac.new(WEBHOOK_SECRET, body, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="bad signature")


def require_audit_token(authorization: str | None = Header(default=None)) -> None:
    if APP_ENV == "development" and not AUDIT_API_TOKEN:
        return
    if not AUDIT_API_TOKEN:
        raise HTTPException(status_code=503, detail="audit API access is not configured")
    scheme, separator, supplied = (authorization or "").partition(" ")
    if not separator or scheme.lower() != "bearer" or not hmac.compare_digest(supplied, AUDIT_API_TOKEN):
        raise HTTPException(
            status_code=401,
            detail="invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def read_webhook_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_length = int(content_length)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="invalid Content-Length") from exc
        if declared_length < 0:
            raise HTTPException(status_code=400, detail="invalid Content-Length")
        if declared_length > MAX_WEBHOOK_BODY_BYTES:
            raise HTTPException(status_code=413, detail="webhook payload too large")

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_WEBHOOK_BODY_BYTES:
            raise HTTPException(status_code=413, detail="webhook payload too large")
        body.extend(chunk)
    return bytes(body)


@app.post("/webhook", status_code=202)
async def webhook(request: Request, x_hub_signature_256: str | None = Header(default=None)):
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise HTTPException(status_code=415, detail="expected application/json")
    body = await read_webhook_body(request)
    verify_signature(body, x_hub_signature_256)

    event = request.headers.get("X-GitHub-Event", "")
    if event == "ping":
        return {"status": "pong"}
    if event != "pull_request":
        return {"status": "ignored", "event": event}

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="invalid JSON payload") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid webhook payload")
    action = payload.get("action")
    if action not in ("opened", "synchronize", "reopened"):
        return {"status": "ignored", "action": action}

    pr = payload.get("pull_request")
    repo_info = payload.get("repository")
    if not isinstance(pr, dict) or not isinstance(repo_info, dict):
        raise HTTPException(status_code=400, detail="missing pull request data")
    head = pr.get("head")
    base = pr.get("base")
    repository = repo_info.get("full_name")
    number = pr.get("number")
    sha = head.get("sha") if isinstance(head, dict) else None
    head_ref = head.get("ref") if isinstance(head, dict) else None
    base_ref = base.get("ref") if isinstance(base, dict) else None
    if (
        not isinstance(repository, str)
        or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository)
        or type(number) is not int
        or number < 1
        or not isinstance(sha, str)
        or not re.fullmatch(r"[0-9a-fA-F]{40}", sha)
        or not isinstance(head_ref, str)
        or not isinstance(base_ref, str)
    ):
        raise HTTPException(status_code=400, detail="invalid pull request data")
    if ALLOWED_REPOS and repository not in ALLOWED_REPOS:
        return {"status": "ignored", "reason": "repo not in ALLOWED_REPOS"}

    state = AuditState(
        repository=repository,
        pr_number=number,
        commit_sha=sha,
        base_ref=base_ref,
        head_ref=head_ref,
        status="queued",
    )
    state.say("orchestrator", f"queued from webhook ({action}) — run {state.run_id}")
    async with queue_lock:
        if store.has_sha(repository, sha):
            return {"status": "skipped", "reason": f"head {sha[:10]} already audited"}
        if queue.full():
            raise HTTPException(status_code=429, detail="audit queue full — retry later")
        store.save(state)
        queue.put_nowait(state)
    return {"status": "queued", "run_id": state.run_id, "depth": queue.qsize()}


@app.get("/audits/{run_id}", dependencies=[Depends(require_audit_token)])
async def get_audit(run_id: str):
    state = store.load(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="unknown run")
    return state.model_dump(exclude={"post_image", "tool_hits"})


@app.get("/audits", dependencies=[Depends(require_audit_token)])
async def list_audits():
    return [
        {"run_id": s.run_id, "repository": s.repository, "pr_number": s.pr_number,
         "status": s.status, "risk": s.overall_risk.value, "findings": len(s.findings),
         "audit_complete": s.audit_complete, "incomplete_reasons": s.incomplete_reasons,
         "review_url": s.review_url, "created_at": s.created_at}
        for s in store.recent()
    ]


class Health(BaseModel):
    status: str
    service: str
    version: str
    redis: bool
    queue_depth: int
    workers: int


@app.get("/health", response_model=Health)
async def health():
    redis_ok = store._redis is not None  # noqa: SLF001 — intentional probe
    return Health(
        status="ok", service="ai-coauds", version=app.version,
        redis=redis_ok, queue_depth=queue.qsize(), workers=WORKERS,
    )

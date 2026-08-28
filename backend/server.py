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
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel

from github_client import GitHubClient
from pipeline import AuditPipeline
from state import AuditState, StateStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("coauds.server")

WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "").encode()
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
REDIS_URL = os.getenv("REDIS_URL") or None
ALLOWED_REPOS = {r.strip() for r in os.getenv("ALLOWED_REPOS", "").split(",") if r.strip()}
MAX_QUEUE = int(os.getenv("MAX_QUEUE", "20"))
WORKERS = int(os.getenv("WORKERS", "2"))

queue: asyncio.Queue[AuditState] = asyncio.Queue(maxsize=MAX_QUEUE)
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
        return  # dev mode — set GITHUB_WEBHOOK_SECRET in production!
    expected = "sha256=" + hmac.new(WEBHOOK_SECRET, body, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="bad signature")


@app.post("/webhook", status_code=202)
async def webhook(request: Request, x_hub_signature_256: str | None = Header(default=None)):
    body = await request.body()
    verify_signature(body, x_hub_signature_256)

    event = request.headers.get("X-GitHub-Event", "")
    if event == "ping":
        return {"status": "pong"}
    if event != "pull_request":
        return {"status": "ignored", "event": event}

    payload = await request.json()
    action = payload.get("action")
    if action not in ("opened", "synchronize", "reopened"):
        return {"status": "ignored", "action": action}

    pr = payload["pull_request"]
    repository = payload["repository"]["full_name"]
    if ALLOWED_REPOS and repository not in ALLOWED_REPOS:
        return {"status": "ignored", "reason": "repo not in ALLOWED_REPOS"}

    sha = pr["head"]["sha"]
    if store.has_sha(repository, sha):
        return {"status": "skipped", "reason": f"head {sha[:10]} already audited"}

    if queue.full():
        raise HTTPException(status_code=429, detail="audit queue full — retry later")

    state = AuditState(
        repository=repository,
        pr_number=pr["number"],
        commit_sha=sha,
        base_ref=pr["base"]["ref"],
        head_ref=pr["head"]["ref"],
        status="queued",
    )
    state.say("orchestrator", f"queued from webhook ({action}) — run {state.run_id}")
    store.save(state)
    await queue.put(state)
    return {"status": "queued", "run_id": state.run_id, "depth": queue.qsize()}


@app.get("/audits/{run_id}")
async def get_audit(run_id: str):
    state = store.load(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="unknown run")
    return state.model_dump(exclude={"post_image", "tool_hits"})


@app.get("/audits")
async def list_audits():
    return [
        {"run_id": s.run_id, "repository": s.repository, "pr_number": s.pr_number,
         "status": s.status, "risk": s.overall_risk.value, "findings": len(s.findings),
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

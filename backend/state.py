"""AI CoAudS — shared workflow state.

Single source of truth for one audit run. Every agent reads and writes
this model; it is persisted to Redis (or in-memory in local mode) after
each pipeline stage so a crashed worker can be inspected mid-flight.
"""
from __future__ import annotations

import logging
import time
import uuid
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

log = logging.getLogger("coauds.state")

SEVERITY_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Finding(BaseModel):
    id: str
    agent: str                    # orchestrator | style | security | tools | review
    file: str
    line: int
    severity: Severity
    confidence: float = Field(ge=0.0, le=1.0)
    cwe: Optional[str] = None
    title: str
    issue: str
    recommendation: str
    source: str = "rule"          # rule | llm | hybrid
    tools: list[str] = Field(default_factory=list)   # corroborating tool ids
    patch: Optional["Patch"] = None


class Patch(BaseModel):
    before: str
    after: str
    note: str
    validated: bool = False
    validation_detail: str = ""


class StageLog(BaseModel):
    t: float
    agent: str
    text: str


class AuditState(BaseModel):
    """The shared blackboard passed between agents."""

    run_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    created_at: float = Field(default_factory=time.time)
    repository: str
    pr_number: int
    commit_sha: str
    base_ref: str = "main"
    head_ref: str = ""
    changed_files: list[str] = Field(default_factory=list)
    additions: int = 0
    deletions: int = 0
    post_image: dict[str, str] = Field(default_factory=dict)   # file -> reconstructed content
    added_lines: dict[str, list[int]] = Field(default_factory=dict)  # file -> new-file line numbers
    tool_hits: list[dict] = Field(default_factory=list, exclude=True)
    findings: list[Finding] = Field(default_factory=list)
    dropped: list[dict] = Field(default_factory=list)     # low-confidence, uncorroborated
    validations: list[dict] = Field(default_factory=list)
    overall_risk: Severity = Severity.INFO
    review_markdown: str = ""
    review_url: Optional[str] = None
    posted: bool = False
    status: str = "queued"        # queued | running | done | failed
    stage: str = "fetch"
    error: Optional[str] = None
    log: list[StageLog] = Field(default_factory=list)

    def say(self, agent: str, text: str) -> None:
        self.log.append(StageLog(t=time.time(), agent=agent, text=text))
        log.info("[%s] %s: %s", self.run_id, agent, text)

    def recount(self) -> None:
        rank = max((SEVERITY_RANK[f.severity.value] for f in self.findings), default=0)
        self.overall_risk = Severity(
            {4: "critical", 3: "high", 2: "medium", 1: "low", 0: "info"}[rank]
        )

    @property
    def counts(self) -> dict[str, int]:
        counts = {s.value: 0 for s in Severity}
        for f in self.findings:
            counts[f.severity.value] += 1
        return counts


Finding.model_rebuild()


class StateStore:
    """Persistence boundary. Redis in production, memory for `--local`."""

    PREFIX = "coauds:audit:"
    INDEX = "coauds:runs"

    def __init__(self, redis_url: Optional[str]):
        self._redis = None
        self._mem: dict[str, str] = {}
        if redis_url:
            try:
                import redis  # imported lazily so local mode has no hard dep

                self._redis = redis.Redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                log.info("state store: redis (%s)", redis_url)
            except Exception as exc:  # pragma: no cover
                log.warning("redis unavailable (%s) — falling back to memory", exc)
                self._redis = None
        if self._redis is None:
            log.info("state store: in-memory (local mode)")

    @property
    def redis_connected(self) -> bool:
        """public liveness probe (health endpoint) — no private access needed"""
        return self._redis is not None

    def key(self, run_id: str) -> str:
        return f"{self.PREFIX}{run_id}"

    def save(self, state: AuditState) -> None:
        blob = state.model_dump_json()
        if self._redis:
            self._redis.set(self.key(state.run_id), blob, ex=60 * 60 * 24)
            self._redis.zadd(self.INDEX, {state.run_id: state.created_at})
            self._redis.zremrangebyrank(self.INDEX, 0, -201)  # keep last 200 runs
        else:
            self._mem[state.run_id] = blob

    def load(self, run_id: str) -> Optional[AuditState]:
        blob = self._redis.get(self.key(run_id)) if self._redis else self._mem.get(run_id)
        return AuditState.model_validate_json(blob) if blob else None

    def recent(self, limit: int = 20) -> list[AuditState]:
        if self._redis:
            ids = self._redis.zrevrange(self.INDEX, 0, limit - 1)
            return [s for s in (self.load(i) for i in ids) if s]
        return [AuditState.model_validate_json(b) for b in list(self._mem.values())[-limit:][::-1]]

    def has_sha(self, repository: str, sha: str) -> bool:
        """Dedupe: skip re-auditing the same head SHA."""
        for s in self.recent(50):
            if s.repository == repository and s.commit_sha == sha:
                return True
        return False

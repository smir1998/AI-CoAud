"""Typed, validated configuration — the single place environment is read.

Bad or missing config now fails at startup with an actionable message
(pydantic validation errors name the exact variable) instead of surfacing
as a mysterious runtime failure deep inside a request handler.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── GitHub ─────────────────────────────────────────────
    github_token: str = ""
    github_webhook_secret: str = ""
    # comma-separated owner/repo allowlist; empty list = allow all
    allowed_repos: list[str] = Field(default_factory=list)

    # ── LLM (crewai / litellm read these too) ──────────────
    llm_model: str = "anthropic/claude-sonnet-4-5"
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # ── infrastructure ─────────────────────────────────────
    redis_url: str | None = None
    workers: int = Field(default=2, ge=1, le=16)
    max_queue: int = Field(default=20, ge=1, le=200)

    # ── abuse limits ───────────────────────────────────────
    # reject webhook bodies above this size before parsing (DoS guard)
    max_webhook_bytes: int = Field(default=1_000_000, ge=10_000)

    @property
    def repo_allowlist(self) -> set[str]:
        return {r.strip() for r in self.allowed_repos if r.strip()}

    @property
    def has_hmac(self) -> bool:
        return bool(self.github_webhook_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

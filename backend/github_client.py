"""AI CoAudS — GitHub REST client.

Async, rate-limit aware, and defensive: a review that cannot be posted
inline (422 — e.g. comment on an outdated diff position) degrades to a
single PR issue comment instead of failing the whole audit.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

log = logging.getLogger("coauds.github")

BASE = "https://api.github.com"
HEADERS = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
MAX_INLINE_COMMENTS = 50  # GitHub caps review payloads


class GitHubError(Exception):
    pass


class TransientGitHubError(GitHubError):
    pass


@dataclass
class PRFile:
    path: str
    status: str
    additions: int
    deletions: int
    patch: Optional[str]


@dataclass
class PRMeta:
    owner: str
    repo: str
    number: int
    title: str
    author: str
    base_ref: str
    head_ref: str
    head_sha: str
    files: list[PRFile]


def _check(res: httpx.Response) -> None:
    remaining = res.headers.get("X-RateLimit-Remaining")
    if remaining is not None and int(remaining) < 25:
        log.warning("github rate limit low: %s remaining", remaining)
    if res.status_code in (403, 429):
        raise TransientGitHubError(f"rate limited ({res.status_code})")
    if res.status_code >= 400:
        try:
            msg = res.json().get("message", res.text[:200])
        except Exception:
            msg = res.text[:200]
        raise GitHubError(f"{res.status_code}: {msg}")


class GitHubClient:
    def __init__(self, token: str, timeout: float = 30.0):
        self._client = httpx.AsyncClient(
            base_url=BASE,
            headers={**HEADERS, "Authorization": f"Bearer {token}"},
            timeout=timeout,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    @retry(
        retry=retry_if_exception_type(TransientGitHubError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=15),
        reraise=True,
    )
    async def get_pull(self, owner: str, repo: str, number: int) -> PRMeta:
        pr = (await self._get(f"/repos/{owner}/{repo}/pulls/{number}"))
        files = []
        page = 1
        while True:  # paginate — PRs can exceed 100 files
            batch = await self._get(f"/repos/{owner}/{repo}/pulls/{number}/files", {"per_page": 100, "page": page})
            if not batch:
                break
            files += [
                PRFile(f["filename"], f["status"], f["additions"], f["deletions"], f.get("patch"))
                for f in batch
            ]
            if len(batch) < 100:
                break
            page += 1
        return PRMeta(
            owner=owner,
            repo=repo,
            number=number,
            title=pr["title"],
            author=pr["user"]["login"],
            base_ref=pr["base"]["ref"],
            head_ref=pr["head"]["ref"],
            head_sha=pr["head"]["sha"],
            files=files,
        )

    async def _get(self, path: str, params: Optional[dict] = None) -> Any:
        res = await self._client.get(path, params=params)
        _check(res)
        return res.json()

    async def create_review(
        self,
        meta: PRMeta,
        body: str,
        event: str,  # APPROVE | REQUEST_CHANGES | COMMENT
        comments: list[dict],
    ) -> str:
        """Post the review; returns its html url. Chunks inline comments and
        falls back to a plain issue comment if inline positions are rejected."""
        slug = f"{meta.owner}/{meta.repo}"
        try:
            head, rest = comments[:MAX_INLINE_COMMENTS], comments[MAX_INLINE_COMMENTS:]
            payload: dict[str, Any] = {
                "commit_id": meta.head_sha,
                "body": body + (f"\n\n_{len(rest)} further comments omitted — see thread._" if rest else ""),
                "event": event,
                "comments": head,
            }
            res = await self._client.post(f"/repos/{slug}/pulls/{meta.number}/reviews", json=payload)
            _check(res)
            url = res.json()["html_url"]
            # remaining comments go as threaded replies under the review
            for chunk in _chunks(rest, MAX_INLINE_COMMENTS):
                follow = await self._client.post(
                    f"/repos/{slug}/pulls/{meta.number}/reviews",
                    json={"commit_id": meta.head_sha, "body": "_continued…_", "event": "COMMENT", "comments": chunk},
                )
                _check(follow)
            log.info("review posted: %s (%s)", url, event)
            return url
        except GitHubError as exc:
            log.warning("inline review failed (%s) — posting body as issue comment", exc)
            res = await self._client.post(
                f"/repos/{slug}/issues/{meta.number}/comments", json={"body": body}
            )
            _check(res)
            return res.json()["html_url"]


def _chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]

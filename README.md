# AI CoAudS

**Agentic, multi-agent code auditing for GitHub Pull Requests.**
Deterministic scanners and LLM auditors check each other — only corroborated findings, with validated patches, get posted back to the PR.

```
GitHub PR ──▶ webhook ──▶ orchestrator ──▶ security · style · SAST (parallel)
                                    ──▶ refactor ──▶ review ──▶ validation ──▶ PR review
```

---

## Why it exists

- Static scanners (Semgrep, Bandit, Ruff) flood reviewers with noise.
- LLM-only reviewers confidently hallucinate vulnerabilities that don't exist.
- **AI CoAudS makes the two verify each other.** An LLM finding must either be corroborated by a deterministic tool hit or clear a high confidence bar; every generated patch is validated before it is allowed near the PR.

## What you get

- **Real PR ingestion** — GitHub REST API (`/pulls/{n}`, `/pulls/{n}/files`), any public repo, or paste a unified diff directly.
- **Deterministic engine** — ~25 security detectors (SQLi via interpolation, hardcoded secrets & AWS keys, `eval`/`exec`, `shell=True`, MD5, pickle/yaml deserialization, disabled TLS verification, debug mode, path traversal, weak PRNGs, JWT bypass, command injection, XSS…) plus style heuristics (complexity, function length, bare/swallowed excepts, mutable defaults, duplication, naming).
- **Live LLM agents** — Anthropic or OpenAI keys (stored locally, sent only to the provider). Security findings are corroborated against rule hits or surfaced as novel; the refactor agent patches what no template covers.
- **Validated patches** — target lines must exist, replacements must be non-empty, brackets must balance. Rejections are logged honestly.
- **Real posting** — with a GitHub token the review is posted via `/pulls/{n}/reviews` with inline comments, `REQUEST_CHANGES` or `APPROVE`.

## The agents

| Agent | Job |
|---|---|
| Orchestrator | Fetches PR + diff, owns shared state, dispatches, aggregates |
| Security | Injection, secrets, auth, deserialization, dependency risk |
| Style | Smells, complexity, naming, duplication |
| Refactor | Behavior-preserving patches with rationale |
| Review | Dedupe, severity (Critical→Info), final markdown review |
| Validation | Patch applicability, findings on changed lines, comment limits |

## Quickstart — browser console

```bash
npm install
npm run dev        # local dev server
npm run build      # production bundle in dist/
```

Open the **live console**, pick a sample PR or paste `owner/repo#123`. Add keys in the ⚙ drawer to enable LLM agents and real review posting.

## Repository layout

```
├── src/                    audit console (React + Vite + Tailwind)
├── backend/                webhook service — FastAPI + CrewAI + scanners
│   ├── server.py           HMAC-verified webhook, bounded worker pool
│   ├── pipeline.py         orchestrator: parallel audit → review → post
│   ├── agents.py           security / style / refactor / review crew
│   ├── state.py            AuditState + Redis store (in-memory fallback)
│   ├── github_client.py    diffs + chunked review posting
│   ├── tools.py            semgrep · bandit · ruff · pip-audit runners
│   ├── validation.py       patch-parse & apply gate
│   └── Dockerfile          non-root, healthchecked
├── deploy/                 Dockerfile.web + production nginx (CSP-locked)
├── docker-compose.yml      web + api + redis, health-gated startup
├── .github/workflows/      typecheck · python gate · signed ghcr images
└── DEPLOY.md               local / VPS / Fly / static-host runbooks
```

## Quickstart — Python service

The service deploys with:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # GITHUB_TOKEN, GITHUB_WEBHOOK_SECRET, LLM keys
uvicorn server:app --port 8000
```

or the full stack: `cp backend/.env.example .env && docker compose up --build`
(console on `:8080`, webhook on `:8000`, see [DEPLOY.md](DEPLOY.md) for TLS,
webhook wiring and hosting options).

## Configuration

| Setting | Used for |
|---|---|
| GitHub token | fetching private-adjacent rate limits, **posting reviews** |
| Anthropic / OpenAI key | LLM security + refactor agents |
| Rules-only mode | runs with zero keys — deterministic engine only |

Keys live in `localStorage` and are sent only to the respective provider or `api.github.com`.

## Sample review

```markdown
## 🤖 AI CoAudS Review — overall risk: **HIGH**

### Security — HIGH · auth.py:21
SQL injection: user input reaches cursor.execute via f-string.  confidence 96%
> fix: parameterize → cursor.execute("SELECT … WHERE name = %s", (username,))

### Patches validated: 4/4 · files: 3 · findings: 10
```

## Roadmap

`v2.0` MCP tool server · strict structured outputs — `v2.1` tree-sitter context, SARIF → GitHub Code Scanning — `v2.2` gVisor patch sandbox, token ledger + model routing — `v2.3` embedding cache for unchanged hunks — `v2.4` eval harness, A2A interop, self-editing review comments.

## Notes

- Findings are advisory; severity is confidence-weighted, CVSS-aligned.
- Nothing is pushed to a branch without human approval — reviews and comments only.

MIT

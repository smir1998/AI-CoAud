# AI CoAudS

**Agentic, multi-agent code auditing for GitHub Pull Requests.**
Deterministic scanners and LLM auditors check each other — only corroborated findings, with validated patches, get posted back to the PR.

```text
GitHub PR ──▶ Webhook (HMAC) ──▶ Orchestrator ──▶ Security ‖ Style ‖ SAST (Semgrep · Bandit · Ruff · pip-audit)
                                              ──▶ Corroborate ──▶ Refactor ──▶ Review ──▶ Validation ──▶ PR Review
```

## Live Deployment & CI/CD

| Surface | Details |
| :--- | :--- |
| **Live Console** | `smir1998.github.io/AI-CoAud/` — deployed automatically on every push to `main` via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) |
| **CI Pipeline** | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — TypeScript typecheck, Vite bundle build, Python 3.12 syntax/Ruff gate, `pip install --dry-run` dependency resolution check, `pip-audit` + Bandit vulnerability scan, and multi-stage GHCR image publishing |
| **Container Images** | `ghcr.io/smir1998/ai-coaud/web` (Nginx + CSP-locked SPA) and `ghcr.io/smir1998/ai-coaud/api` (Python 3.12 FastAPI + CrewAI + scanners) |
| **Local Stack** | `docker compose up --build` — `web` (`:8080`), `api` (`:8000`), and `redis:8-alpine` (`:6379`) with health-gated startup |

> First-time GitHub Pages setup: **Settings → Pages → Build and deployment → Source → GitHub Actions**. The workflow stamps `VITE_BASE`, `VITE_REPO_URL`, and `VITE_DEPLOYED_URL` into the console footer automatically.

## Why It Exists

- **Static scanners alone flood reviewers with noise.** Semgrep, Bandit, and Ruff surface syntax-level pattern hits without full intent context.
- **LLM-only reviewers hallucinate.** Unconstrained models invent line numbers, flag untouched code, or propose patches that fail to parse.
- **AI CoAudS makes the two verify each other.** Every LLM finding must either be corroborated within 3 lines by a deterministic tool hit or clear a strict confidence floor (`≥ 0.60`), target an actual added diff line, and carry a patch that passes bracket-balance, `ast.parse`, and `ruff check` validation before it is posted to GitHub.

## What You Get

- **Real PR ingestion** — Fetch any public or private PR via the GitHub REST API (`/repos/{owner}/{repo}/pulls/{n}` and paginated `/files`), try 3 built-in PR fixtures (`acme/api-service #142`, `acme/file-store #87`, `acme/docs-site #23`), or paste a unified diff directly.
- **Deterministic engine** — 20 security detectors mapped to CWEs (SQLi via interpolation/templates, hardcoded secrets & AWS keys, PEM private keys, `eval`/`exec`, `shell=True`, MD5/SHA1, `pickle`/`yaml.load`, disabled TLS verification, debug mode, path traversal, weak PRNGs, JWT verification bypass, XSS, cleartext HTTP, `0777` permissions, sensitive logging) plus 10 style & structural checks.
- **Live LLM agents** — Bring an Anthropic (`claude-sonnet-4-5`) or OpenAI (`gpt-4o`) key in the browser drawer (stored in `localStorage` only) or run the Python backend with CrewAI (`crewai==1.15.18`) and automatic direct-API fallback.
- **Validated patches** — Deterministic templates and the Refactor Agent generate minimal, behavior-preserving replacements. Every patch is checked against the post-image file, bracket balance, Python `ast.parse`, and `ruff check --select E9,F`.
- **Real GitHub review posting** — Posts inline review comments via `POST /repos/{owner}/{repo}/pulls/{n}/reviews` (`REQUEST_CHANGES` or `APPROVE`), with automatic fallback to a single PR issue comment if GitHub rejects an outdated diff position (`422`).

## The Six Agents

| Agent | Role & Responsibility | Tools & Inputs | Shared State Contract |
| :--- | :--- | :--- | :--- |
| **Orchestrator** | Verifies webhook HMAC, fetches PR metadata & paginated diffs, reconstructs file post-images, dispatches parallel workers, and persists state to Redis after every stage | `GitHubClient`, `parse_diff`, `StateStore` | `changed_files`, `post_image`, `added_lines`, `status`, `stage` |
| **Security Agent** | Audits added hunks for injection, hardcoded credentials, broken auth/crypto, unsafe deserialization, SSRF, and path traversal | CrewAI `Agent` / Anthropic SDK, `SECURITY_BRIEF` | `FindingList` (`agent="security"`, `source="llm"`) |
| **Style Agent** | Audits added hunks for cyclomatic complexity, long functions, duplicated blocks, bare/swallowed exceptions, mutable defaults, and naming | CrewAI `Agent` / Anthropic SDK, `STYLE_BRIEF` | `FindingList` (`agent="style"`, `source="llm"`) |
| **Static Tools** | Runs mechanical SAST and dependency scanners in an isolated temp workspace with hard 90s per-tool timeouts | `semgrep`, `bandit`, `ruff`, `pip-audit` | `tool_hits` → corroborated `hybrid` / `rule` findings |
| **Refactor Agent** | Rewrites vulnerable or problematic lines into minimal, behavior-preserving patches using templates first and LLM synthesis as fallback | `TEMPLATES` (`SEC-*`), `refactor_agent` | `Finding.patch` (`before`, `after`, `note`) |
| **Review & Validation** | Drops off-hunk claims and low-confidence uncorroborated LLM hits, validates every patch (`ast.parse` + `ruff`), ranks severity (`Critical → Info`), and formats the final review | `drop_off_hunk_findings`, `validate_patches` | `validations`, `overall_risk`, `review_markdown`, `posted` |

## The Console Views

| View | What It Does |
| :--- | :--- |
| **01 Live Console** | Ingests live GitHub PRs or unified diffs, runs the 6-stage pipeline with real-time stage logs, inspects corroborated findings and validated diffs, and posts reviews directly to GitHub |
| **02 Architecture** | Interactive SVG data-flow diagram, per-agent contracts, corroboration rules, and stack breakdown |
| **03 README Studio** | Split-pane live Markdown editor loaded from `README.md?raw`, one-click live detector table insertion, and direct GitHub commit modal (`PUT /repos/{owner}/{repo}/contents/{path}`) |
| **04 Implementation** | Byte-for-byte code browser (`?raw` imports) inspecting `server.py`, `pipeline.py`, `agents.py`, `state.py`, `github_client.py`, `tools.py`, `validation.py`, `requirements.txt`, Dockerfiles, and `ci.yml` |

## Deterministic Security Detectors

_20 built-in rules executed on every changed hunk alongside Semgrep and Bandit:_

| Rule ID | Severity | CWE | Detector |
| :--- | :--- | :--- | :--- |
| `SEC-023` | Critical | CWE-798 | Private key committed to source (`BEGIN RSA/OPENSSH/EC/DSA/PGP PRIVATE KEY`) |
| `SEC-001` | High | CWE-798 | Hardcoded AWS access key (`AKIA...` / `ASIA...`) |
| `SEC-002` | High | CWE-798 | Hardcoded secret / credential assignment |
| `SEC-003` | High | CWE-89 | SQL built by string interpolation (`f"SELECT..."`, `%`, `.format`) |
| `SEC-024` | High | CWE-89 | SQL built with JS/TS template literal |
| `SEC-013` | High | CWE-347 | JWT signature verification disabled (`verify=False`) |
| `SEC-005` | High | CWE-95 | Dynamic code execution (`eval()` / `exec()`) |
| `SEC-018` | High | CWE-78 | Shell command built from template (`child_process` / `exec`) |
| `SEC-004` | Medium | CWE-78 | `shell=True` subprocess call |
| `SEC-006` | Medium | CWE-328 | Weak hash (`MD5` / `SHA1`) used for credentials |
| `SEC-007` | Medium | CWE-502 | Unsafe deserialization with `pickle.load` / `pickle.loads` |
| `SEC-010` | Medium | CWE-502 | `yaml.load` without `SafeLoader` |
| `SEC-008` | Medium | CWE-295 | TLS certificate verification disabled (`verify=False`) |
| `SEC-009` | Medium | CWE-489 | Framework debug mode enabled (`DEBUG = True` / `debug=True`) |
| `SEC-012` | Medium | CWE-22 | Path built from unsanitized user input (`os.path.join`) |
| `SEC-011` | Medium | CWE-330 | Non-cryptographic PRNG (`random.*`) used for secrets/tokens |
| `SEC-017` | Medium | CWE-79 | Unescaped HTML injection (`dangerouslySetInnerHTML`) |
| `SEC-022` | Low | CWE-319 | Cleartext HTTP endpoint |
| `SEC-014` | Low | CWE-732 | World-writable file permissions (`0777`) |
| `SEC-021` | Low | CWE-532 | Sensitive value written to stdout/logs |

## Style & Structural Heuristics

| Rule ID | Severity | Check |
| :--- | :--- | :--- |
| `STY-002` | Medium | High cyclomatic complexity (`> 10` independent paths in a function) |
| `STY-003` | Medium | Bare `except:` clause swallowing `SystemExit` / `KeyboardInterrupt` |
| `STY-011` | Medium | Exception silently swallowed (`except Exception: pass`) |
| `STY-009` | Medium | Mutable default argument (`def fn(x=[])` / `def fn(x={})`) |
| `STY-001` | Low | Overly long function (`> 45` added lines) |
| `STY-010` | Low | Duplicated code block (`≥ 3×` across the diff) |
| `STY-005` | Low | `print()` statement in non-test service/library code |
| `STY-012` | Low | Wildcard import (`from module import *`) |
| `STY-006` | Low | Non-PEP8 `camelCase` function name in Python |
| `STY-008` | Info | Line length exceeds 120 characters |

## Quickstart

### 1. Browser Console (Static SPA)

```bash
npm install
npm run dev        # local dev server on localhost:5173
npx tsc --noEmit   # strict TypeScript verification
npm run build      # production bundle in dist/
```

### 2. Python Webhook Service (`backend/`)

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set GITHUB_TOKEN, GITHUB_WEBHOOK_SECRET, ANTHROPIC_API_KEY / OPENAI_API_KEY
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Full Container Stack (Web + API + Redis)

```bash
cp backend/.env.example .env  # set GITHUB_TOKEN and API keys
docker compose up --build
# Console → localhost:8080
# Webhook → localhost:8000/webhook
# Health  → localhost:8000/health
```

### 4. Dependency Resolution & Security Gate

The backend dependency graph in [`backend/requirements.txt`](backend/requirements.txt) uses a strict version-ownership layout so `crewai==1.15.18` resolves its transitive tree (`litellm`, `openai`, `anthropic`, `chromadb`) without version-floor collisions, while capping shared major versions (`fastapi<1.0`, `starlette<2.0`, `pydantic>=2.11,<3.0`, `pydantic-settings>=2.14.2,<3.0`, `httpx<1.0`, `tenacity>=8.2,<10.0`).

Verify dependency resolution and vulnerability scanning locally before pushing:

```bash
bash scripts/check-deps.sh
pip-audit --desc --progress-spinner off $(python -c 'import tomllib; print(" ".join(f"--ignore-vuln {v}" for v in tomllib.load(open(".pip-audit.toml", "rb"))["options"]["ignore"]))')
bandit -r backend -ll -q
```

## Configuration

| Variable / Setting | Where | Purpose |
| :--- | :--- | :--- |
| `GITHUB_TOKEN` | Backend `.env` or Browser drawer | Fetch private PRs, raise rate limits, and post inline PR reviews |
| `GITHUB_WEBHOOK_SECRET` | Backend `.env` | HMAC-SHA256 verification (`X-Hub-Signature-256`) on `POST /webhook` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Backend `.env` or Browser drawer | Live LLM Security, Style, and Refactor agents (falls back to deterministic rules when omitted) |
| `LLM_MODEL` | Backend `.env` | Default CrewAI model identifier (defaults to `anthropic/claude-sonnet-4-5`) |
| `REDIS_URL` | Backend `.env` | Redis state store URL (falls back to in-memory store when unset) |
| `ALLOWED_REPOS` | Backend `.env` | Optional comma-separated repository allowlist (`owner/repo`) |
| `WORKERS` / `MAX_QUEUE` | Backend `.env` | Bounded `asyncio` worker pool size (default `2`) and queue cap (default `20`) |

## Repository Layout

```text
├── src/                        # React 19 + TypeScript + Tailwind audit console
│   ├── App.tsx                 # View switcher, error boundary, live status header/footer
│   ├── config.ts               # Runtime endpoints, storage keys, deploy metadata
│   ├── types.ts                # Shared TypeScript contracts & agent metadata
│   ├── analysis/
│   │   ├── scanner.ts          # Unified-diff parser, 20 SEC-* rules, 10 STY-* checks, patch validator
│   │   ├── pipeline.ts         # Browser-side multi-agent orchestrator & corroboration engine
│   │   └── external.ts         # Direct GitHub REST, Anthropic, and OpenAI browser clients
│   ├── components/
│   │   ├── Console.tsx         # Live PR audit workspace & settings drawer
│   │   ├── Findings.tsx        # Filterable finding cards with CWE tags & patch previews
│   │   ├── DiffViewer.tsx      # Side-by-side / unified diff hunk viewer with inline annotations
│   │   ├── ReviewPanel.tsx     # Generated Markdown review & one-click GitHub review publisher
│   │   ├── Architecture.tsx    # Interactive SVG pipeline diagram & agent roster
│   │   ├── Readme.tsx          # Live README Studio with rule-table generator & GitHub commit modal
│   │   └── Codebase.tsx        # In-app source browser powered by Vite ?raw imports
│   └── data/
│       ├── codebase.ts         # ?raw bindings for all shipped backend/deploy/CI files
│       └── fixtures.ts         # Sample PR diffs (vulnerable auth, upload handler, clean docs)
├── backend/                    # Python 3.12 FastAPI + CrewAI webhook service
│   ├── server.py               # HMAC-verified /webhook, /audits, /health + bounded worker pool
│   ├── pipeline.py             # Async orchestrator: fetch → parallel audit → corroborate → validate → post
│   ├── agents.py               # CrewAI specialist agents (FindingList Pydantic schema) + Anthropic fallback
│   ├── state.py                # AuditState blackboard + Redis / in-memory StateStore
│   ├── github_client.py        # Async httpx GitHub client with retries & 422 review fallback
│   ├── tools.py                # Subprocess runners for Semgrep, Bandit, Ruff, and pip-audit
│   ├── validation.py           # Off-hunk filter + bracket, ast.parse, and Ruff patch gate
│   ├── requirements.txt        # Version-ownership manifest for Python 3.12
│   └── Dockerfile              # Slim Python 3.12 image, non-root user, healthcheck
├── deploy/
│   ├── Dockerfile.web          # Multi-stage Node 24 build → hardened Nginx runtime
│   └── nginx.conf              # Strict CSP headers & immutable asset caching
├── scripts/
│   └── check-deps.sh           # Fast local mirror of CI's pip install --dry-run check
├── .github/workflows/
│   ├── ci.yml                  # Web build, Python lint/resolve/vuln-scan gate, GHCR image push
│   └── deploy.yml              # Zero-config GitHub Pages deployment on push to main
├── .pip-audit.toml             # Ignored upstream transitive advisory IDs for pip-audit
├── docker-compose.yml          # Full local stack: web + api + redis:8-alpine
└── DEPLOY.md                   # Local, single-VPS (Caddy), Fly.io/Render, and Pages runbooks
```

## Sample Review Output

```markdown
## 🤖 AI CoAudS Review — overall risk: **HIGH**

### Security — HIGH · auth.py:21
SQL injection: user input reaches cursor.execute via f-string.  confidence 96% · corroborated by semgrep, bandit
> fix: parameterize → cursor.execute("SELECT id, role FROM users WHERE name = %s", (username,))

### Patches validated: 4/4 · files: 3 · findings: 10
```

## Roadmap

- `v2.0` — MCP tool server & strict structured outputs
- `v2.1` — Tree-sitter AST context & SARIF export to GitHub Code Scanning
- `v2.2` — gVisor patch sandbox, token ledger, and cost-aware model routing
- `v2.3` — Embedding cache for unchanged diff hunks
- `v2.4` — Evaluation harness, A2A interop, and self-editing PR review comments

## License

MIT © 2026 Syed Mohammad Irtiza Rizvi — see [LICENSE](LICENSE).

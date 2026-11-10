# AI CoAudS

**A browser-first code audit console for pull requests, repository branches, and unified diffs.**

[![CI](https://github.com/smir1998/AI-CoAud/actions/workflows/ci.yml/badge.svg)](https://github.com/smir1998/AI-CoAud/actions/workflows/ci.yml)

**Live app:** [smir1998.github.io/AI-CoAud](https://smir1998.github.io/AI-CoAud/)

AI CoAudS combines deterministic security and code-quality checks with optional LLM review. The React console runs directly in your browser. An optional Python service accepts GitHub pull-request webhooks and runs queued audits.

## Choose an audit source

The **Live Console** offers four inputs:

| Input | What it audits | GitHub write access |
| --- | --- | --- |
| **GitHub PR** | The changed text patches and PR metadata | Optional; needed to post a review |
| **Repository branch** | A pinned snapshot of supported text and source files on a branch | None for public repositories; a read token for private repositories |
| **Paste diff** | A unified diff supplied by the user | None |
| **Samples** | One of the included example PR diffs | None |

Repository snapshots do not modify branches or post reviews. They cover up to **40 source files without a GitHub token** or **120 with one**, with a **256 KB per-file limit**, **4 MB total content limit**, **5,000 lines per file**, and **20,000 lines total**. Generated and vendor directories are excluded. The console reports partial coverage when GitHub truncates a tree or a file is skipped by these limits. The branch defaults to the repository’s default branch when the branch field is blank.

PR audits cover up to 200 changed files. Files without a text patch are skipped and shown as partial coverage. Partial PR audits are never auto-approved.

## What the browser audit does

1. Fetches a PR diff or a bounded repository snapshot, or parses the supplied diff.
2. Runs the built-in security rules and style heuristics on the selected lines.
3. Optionally asks a configured provider for security findings and validated patch suggestions. The specialist toggle adds up to five focused security calls and is off by default.
4. Validates suggested patches before displaying them. The app does not apply changes to the audited repository.
5. Builds a review summary. For PR input, a GitHub token can post inline comments and the review verdict.

The browser scanner includes checks for credential patterns, SQL and command injection, unsafe deserialization, disabled TLS verification, weak hashes and other common source-level risks. These rules are useful review signals; they do not replace language-aware static analysis or a full dependency scanner.

## Privacy and GitHub permissions

- GitHub and LLM tokens are saved in this browser’s `localStorage`. Browser requests go directly to GitHub or the selected LLM provider; the static console does not proxy them through the AI CoAudS backend.
- Public PRs and repository snapshots can be read without a token, subject to GitHub’s unauthenticated rate limit.
- Private repository reads need a fine-grained token with **Contents: read** and **Pull requests: read** for the target repository.
- Posting a PR review additionally needs **Pull requests: write**. Leave that permission off if you only want to inspect or copy the generated review.
- When an LLM provider is enabled, code included in the audit context is sent to that provider. The specialist option may add up to five model requests per audit.

## Screens in the console

| Screen | Purpose |
| --- | --- |
| **Live Console** | Choose PR, repository branch, diff, or sample input; inspect files, findings, review, and audit logs |
| **Architecture** | View the browser workflow and the separate webhook service architecture |
| **README Studio** | Edit a local README draft, preview it, generate detector tables, or explicitly commit it through GitHub’s Contents API |
| **Implementation** | Browse selected repository source and deployment files bundled into the app |

## Run locally

### Browser console

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open the Vite URL shown in the terminal. Select an audit input in the console; opening the page does not start a sample audit.

### Checks

```bash
npm test
npm run typecheck
npm run build
```

### Python webhook service

Requires Python 3.12. Copy `backend/.env.example` to `.env`, set the GitHub token and separate webhook/API secrets, then run:

```bash
python -m venv .venv
# Activate the virtual environment for your shell, then:
pip install -r backend/requirements.txt
python -m unittest discover -s backend/tests -v
```

The service requires `GITHUB_WEBHOOK_SECRET` and `AUDIT_API_TOKEN` outside development mode. `ALLOWED_REPOS` can restrict which repositories are accepted by the webhook. The audit API endpoints require a bearer token when configured.

### Docker Compose

Set the required values in `.env` using `backend/.env.example`, then run:

```bash
docker compose up --build
```

The web console is at `http://localhost:8080`, the webhook/API at `http://localhost:8000`, and Redis is used for audit state. Point a GitHub webhook to `/webhook` only after configuring the webhook secret and API token.

## Deployment and CI

- GitHub Pages publishes the Vite console on pushes to `main` through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs frontend tests, TypeScript checks, the production build, Python syntax/lint checks, dependency resolution, `pip-audit`, and Bandit.
- The Jekyll fallback workflow is manual-only so it cannot race the SPA deployment.
- `docker compose up --build` builds the web and backend containers for local use.

## Repository layout

```text
src/
├── analysis/
│   ├── external.ts       # GitHub and LLM HTTP clients, PR and repository snapshot fetching
│   ├── pipeline.ts       # Browser audit stages, finding merge, review and validation
│   ├── scanner.ts        # Unified diff parsing, snapshot line mapping, security/style rules
│   └── specialists.ts    # Optional focused security reviewer prompts and validation
├── components/
│   ├── Console.tsx       # Audit source controls, settings, findings and shared state
│   ├── DiffViewer.tsx    # Source/diff view with finding locations
│   ├── Findings.tsx      # Finding details and suggested patch display
│   ├── ReviewPanel.tsx   # Review summary, copy/download, and GitHub post result
│   ├── Readme.tsx        # README editor and optional GitHub commit flow
│   └── Architecture.tsx  # In-app architecture screen
├── data/
│   └── fixtures.ts       # Explicit sample audit inputs
└── engine/useAuditEngine.ts  # UI state, settings persistence, cancellation

backend/
├── server.py             # FastAPI webhook, audit endpoints, bounded worker queue
├── pipeline.py           # Webhook audit orchestration
├── github_client.py      # Async GitHub API client
├── agents.py              # Backend CrewAI agents and schemas
├── tools.py               # Semgrep, Bandit, Ruff, and pip-audit runners
├── validation.py          # Backend patch validation and changed-line checks
└── tests/                 # Webhook, diff, and audit safety tests

deploy/                    # Nginx configuration and web image
.github/workflows/         # CI, GitHub Pages deployment, and manual Jekyll fallback
```

## License

MIT. See [LICENSE](LICENSE).

# Deploying AI CoAudS

Two deployables: the **web console** (static SPA) and the **webhook service**
(FastAPI + audit workers + Redis). They can ship together or separately.

## Repository layout

```
├── src/            web console (React + Vite + Tailwind)
├── backend/        webhook service — FastAPI, CrewAI agents, scanners
├── deploy/         Dockerfile.web + production nginx.conf
├── docker-compose.yml
├── .github/workflows/ci.yml   typecheck · python gate · ghcr images
└── README.md
```

## 0 — Preview architecture & production gate

**Preview = static, always.** The console is built to a single self-contained
`dist/index.html`, so previews run `npm run dev` → **one build, then
`vite preview`** — a plain static server on `:3000`. No transform pipeline,
no per-module fetches, no HMR websocket: whatever the page serves is exactly
what production ships. (`npm run dev:hmr` restores the classic Vite dev loop
for local work.) Proxied preview hosts are additionally rescued by a
middleware fallback in `vite.config.js`, so even a harness that launches the
dev server directly gets the single file.

**Production deploys are gated off until the production stage:**

| Pipeline | State now | Re-enable when |
|---|---|---|
| `deploy.yml` (GitHub Pages) | `workflow_dispatch` only | restore `on.push.branches: [main]` |
| `ci.yml` → images (ghcr.io push) | requires repo variable | set `ENABLE_IMAGE_PUBLISH = true` |

CI keeps running every quality gate (typecheck, build, syntax, lint,
dependency resolve-check, pip-audit + bandit vuln-scan) — nothing ships, but
everything is verified on every push.

## 1 — Local, everything at once

```bash
cp backend/.env.example .env      # fill GITHUB_TOKEN + keys
docker compose up --build
# console  → http://localhost:8080
# webhook  → http://localhost:8000/webhook
# health   → http://localhost:8000/health
```

No Docker? Run the halves by hand:

```bash
npm run dev                                  # build once → static console on :3000
                                             # (npm run dev:hmr for the live dev loop)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
REDIS_URL= uvicorn server:app --reload       # in-memory state mode
```

## 2 — GitHub webhook wiring

GitHub must reach your service publicly.

```bash
# tunnel for testing:
cloudflared tunnel --url http://localhost:8000
# or ngrok http 8000
```

In the repo: **Settings → Webhooks → Add webhook**
- Payload URL: `https://your-host/webhook`
- Content type: `application/json`
- Secret: same value as `GITHUB_WEBHOOK_SECRET`
- Events: *Let me select* → **Pull requests** only

The server verifies the HMAC-SHA256 signature, dedupes by head SHA, and
enqueues onto a bounded worker pool (202 + `run_id` immediately).

## 3 — Production options

### A. Single VPS (simplest)

Caddy in front of compose for automatic TLS:

```caddy
audit.your.dev {
    handle /webhook* { reverse_proxy localhost:8000 }
    handle /audits*  { reverse_proxy localhost:8000 }
    handle /health   { reverse_proxy localhost:8000 }
    reverse_proxy localhost:8080
}
```

### B. Fly.io / Railway / Render

- web: `fly launch --dockerfile deploy/Dockerfile.web` (static, any region)
- api: `fly launch` in `backend/`, then `fly redis create` and set
  `REDIS_URL`, `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`

### C. Static hosting + managed API

Console on Cloudflare Pages / Netlify / Vercel (build `npm run build`,
publish `dist/`); webhook on any container host. The console is fully
client-side — it talks to `api.github.com` and the LLM providers directly.

> **Build-context gotcha:** the web bundle inlines `backend/`,
> `.github/workflows/`, `deploy/` and `README.md` at build time via `?raw`
> imports (the in-app code browser). Never exclude them from the root
> `.dockerignore` — the `images` CI job asserts their presence before
> invoking buildx, and none of them reach the runtime image.

### D. GitHub Pages — automatic, already wired

`.github/workflows/deploy.yml` deploys on every push to `main`:

1. `npm ci && npm run build` with `VITE_BASE=/<repo>/` (subpath-safe assets)
2. `configure-pages` → `upload-pages-artifact` (`dist/`) → `deploy-pages`
3. Live at **https://\<username\>.github.io/\<repo\>/** — the run page shows the URL

The build also receives `VITE_REPO_URL` and `VITE_DEPLOYED_URL`, which render as
the "live · …" chip in the console footer — proof you're on the Pages build.

One-time setup:
- repo **Settings → Pages → Source → GitHub Actions**
- nothing else — no secrets needed, permissions are declared in the workflow

## 4 — Secrets checklist

| Secret | Where | Notes |
|---|---|---|
| `GITHUB_TOKEN` | api env | PR read + review write |
| `GITHUB_WEBHOOK_SECRET` | api env | HMAC verification |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | api env | agent calls |
| `ALLOWED_REPOS` | api env | allowlist, comma-separated |

Never bake keys into the web bundle — the console takes them at runtime
and stores them in the browser only.

## 5 — Operations

- Dependency conflicts surface in CI's `resolve-check requirements` step
  (full pip log, manifest echoed) before any image build — bump one anchor
  at a time, and run `bash scripts/check-deps.sh` before pushing
- pip says "no matching distributions available for your environment"?
  your index/mirror lacks the release — override it:
  `docker build --build-arg PIP_INDEX_URL=https://pypi.org/simple ...`
- `GET /health` → redis status, queue depth, worker count
- `GET /audits` → last 20 runs · `GET /audits/{id}` → full state log
- Bump `WORKERS`/`MAX_QUEUE` to trade LLM spend vs. latency
- Images land in `ghcr.io/<repo>/web` and `/api` on every push to `main`

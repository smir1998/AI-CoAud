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
npm run dev                                  # console on :5173
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

### D. GitHub Pages

Set `base: "/repo-name/"` handling via `VITE_BASE` and publish `dist/`.

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

- `GET /health` → redis status, queue depth, worker count
- `GET /audits` → last 20 runs · `GET /audits/{id}` → full state log
- Bump `WORKERS`/`MAX_QUEUE` to trade LLM spend vs. latency
- Images land in `ghcr.io/<repo>/web` and `/api` on every push to `main`

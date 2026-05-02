# Indexer hosting runbook

> Operator-facing instructions for deploying `@filler-sdk/jit-hints` to a public host. Sprint 5.5 Plan 03 deliverable.

The indexer is **two processes** sharing a Postgres database:

```
              ┌──────────────────────┐
   chain RPC →│  Ponder indexer      │
              │  (writes events)     │
              └──────────┬───────────┘
                         │ writes
                         ▼
                   ┌──────────┐
                   │ Postgres │
                   └────┬─────┘
                        │ reads
                        ▼
              ┌──────────────────────┐
              │  HTTP API server     │← public
              │  /health  /depth     │  HTTPS
              │  /depth/stream (SSE) │
              │  /pools  /metrics    │
              └──────────────────────┘
```

Both processes share `DATABASE_URL`. The API process is the public-facing service; the indexer doesn't need to be public.

---

## Option A — Railway (recommended)

Railway natively supports the two-process pattern via "services in a project" + a Postgres add-on.

```bash
# One-time setup
railway login
cd /path/to/filler-sdk
railway init                # picks a project name

# Add Postgres add-on via the Railway dashboard (project → New → Postgres).
# Copy the connection string for DATABASE_URL below.

# Service 1: HTTP API
railway service create jit-hints-api
railway service connect jit-hints-api
railway up --service jit-hints-api \
  --dockerfile packages/jit-hints/Dockerfile

railway variables set --service jit-hints-api \
  DATABASE_URL=$RAILWAY_POSTGRES_URL \
  PORT=42069 \
  LOG_LEVEL=info \
  DASHBOARD_ORIGIN=https://dashboard.filler-sdk.xyz

# Service 2: Ponder indexer
railway service create jit-hints-indexer
railway service connect jit-hints-indexer
railway up --service jit-hints-indexer \
  --dockerfile packages/jit-hints/Dockerfile

railway variables set --service jit-hints-indexer \
  DATABASE_URL=$RAILWAY_POSTGRES_URL \
  MAINNET_RPC_URL=$YOUR_PAID_RPC \
  MAINNET_START_BLOCK=25008700 \
  LOG_LEVEL=info

# Override the start command of jit-hints-indexer to run Ponder, not the API:
railway variables set --service jit-hints-indexer \
  RAILWAY_RUN_COMMAND="bun run ponder start"

# Both services share the project's Postgres. Domain on jit-hints-api → public.
```

Cost (Railway Hobby tier, May 2026):
- Postgres add-on: $5/mo
- 2 services × ~512 MB RAM × 50% utilization: ~$5/mo
- **Total ≈ $10/mo** — slightly above Plan 03's $5/mo budget. To reduce: combine API + indexer into a single service (start.sh runs both in supervised mode; less robust to crashes).

---

## Option B — Fly.io

Two apps + one Postgres add-on. The included `fly.toml` is for the API only; create a sibling app for the indexer.

```bash
fly launch --copy-config --no-deploy --config packages/jit-hints/deploy/fly.toml
fly postgres create -n filler-sdk-pg
fly postgres attach filler-sdk-pg --app filler-sdk-jit-hints

fly secrets set --app filler-sdk-jit-hints \
  DASHBOARD_ORIGIN=https://dashboard.filler-sdk.xyz \
  LOG_LEVEL=info

fly deploy --config packages/jit-hints/deploy/fly.toml \
           --dockerfile packages/jit-hints/Dockerfile

# Sibling app for Ponder
fly launch --copy-config --no-deploy --name filler-sdk-jit-hints-indexer \
  --config packages/jit-hints/deploy/fly.toml
fly secrets set --app filler-sdk-jit-hints-indexer \
  DATABASE_URL=postgres://...   # from `fly postgres attach`
  MAINNET_RPC_URL=$YOUR_PAID_RPC \
  MAINNET_START_BLOCK=25008700

# Override start command in fly.toml [processes] section to bun run ponder start
```

Cost (Fly Hobby): ~$0-5/mo (free tier covers the API at low traffic; Postgres is $1.94/mo).

---

## Option C — Local fork mode (Sprint 5.5 demo path)

For Sprint 5.5's E2E test, run everything locally pointing at the anvil fork on the host:

```bash
# 1. Start anvil fork (in its own terminal)
anvil --fork-url $MAINNET_RPC --fork-block-number 25008784 --chain-id 31337 --port 8545

# 2. Bring up indexer + API + Postgres
cd /path/to/filler-sdk
docker compose -f packages/jit-hints/deploy/docker-compose.fork.yml up
# (Watch logs for "jit-hints HTTP API listening" + "Connected to JSON-RPC chain=mainnet")

# 3. Smoke test
curl http://localhost:42069/health
# {"status":"ok",...}

# 4. Dashboard env
# In apps/dashboard/.env.local:
#   VITE_DEPTH_INDEXER_URL=http://localhost:42069
```

This is the Sprint 5.5 Plan 06 (E2E validation) preflight. The fork has mainnet's pool state at block 25008784; the indexer reads it; the dashboard subscribes via SSE.

---

## Required env vars per process

| Process | Required | Optional |
|---|---|---|
| **API** (`bun run src/server.ts`) | `DATABASE_URL` | `PORT`, `HOST`, `LOG_LEVEL`, `DASHBOARD_ORIGIN` |
| **Indexer** (`bun run ponder start`) | `DATABASE_URL`, `<CHAIN>_RPC_URL` for each indexed chain | `<CHAIN>_START_BLOCK` (defaults to 0 — set to a recent block to avoid 25M-block backfill), `<CHAIN>_WSS_URL` (faster events) |

---

## Production observability

- **`/health`** — Use as healthcheck endpoint on the host. Returns `{status, version, uptimeSec, chains[]}`.
- **`/metrics`** — Prometheus exposition. Scrape from Grafana/Datadog/Sentry's metric ingest.
- **Pino structured logs** — JSON line format. Pipe into Loki / Datadog / etc.
- **Sentry** — set `SENTRY_DSN` env var (the SDK is opt-in via the `@sentry/node` peer dep).

---

## Known gotchas

### 1. Ponder warns on chain-id mismatch in fork mode

When `MAINNET_RPC_URL=http://host.docker.internal:8545` (anvil fork at chain ID 31337), Ponder logs:

```
WARN  Configured chain ID does not match JSON-RPC response chain=mainnet rpc_chain_id=31337
```

This is **expected + safe**. Ponder continues indexing. Logged in Sprint 5.5 Plan 03 progress doc; not a blocker for fork-mode E2E.

### 2. Ponder's built-in API stage build error

Ponder ships its own minimal admin API server that expects `src/api/index.ts` to default-export a Hono instance. Our `src/api/index.ts` exports `createApp` factory + types. On `ponder start` you'll see:

```
ERROR Build failed stage=api
BuildError: API endpoint file does not export a Hono instance as the default export.
```

**This does NOT block indexing** — the indexer half (event handlers writing to DB) runs fine. The error means Ponder's optional admin API isn't available. Our `bun src/server.ts` handles the public API.

To silence the warning, the next refactor (post-5.5) should split: `ponder/api/index.ts` exports a default Hono for Ponder's admin; `src/api/index.ts` keeps the public API factory.

### 3. Free-tier RPCs rate-limit during backfill

`https://eth.publicnode.com` etc. handle ~100 req/sec. Ponder's backfill bursts above that for the first ~5 min. Either:
- Use a paid RPC tier (Alchemy Growth, Tenderly, Infura) — set `MAINNET_RPC_URL` accordingly
- Use a high `MAINNET_START_BLOCK` (e.g. block N-100 for "tail mode") so backfill is small

### 4. CORS for dashboard origin

The API ships `--cors-origin '*'` by default. For production, set `DASHBOARD_ORIGIN` env var to the exact dashboard URL (e.g. `https://dashboard.filler-sdk.xyz`). The Hono CORS middleware reads this.

---

## Smoke test checklist

After deploying:

```bash
INDEXER_URL=https://your-deployment.up.railway.app

curl -fsS $INDEXER_URL/health
# {"status":"ok","version":"...","uptimeSec":...}

curl -fsS $INDEXER_URL/pools | jq '.count'
# (number of indexed pools — non-zero after backfill completes)

curl -fsS -N $INDEXER_URL/depth/stream?pool=0x...&size=1000000&zeroForOne=true | head -5
# event: depth\ndata: {...}\n\n  (every few seconds)

curl -fsS $INDEXER_URL/metrics | grep jit_hints_requests_total
# Counter values increment per request.
```

If any of these fail, the operator's first stop is the deploy logs (Railway dashboard / `fly logs`). The structured Pino logs name the failed stage.

---

## What this runbook is NOT

- **Not a custom domain setup** — point `indexer.your-domain.xyz` at the host's CNAME via your DNS provider
- **Not a CDN setup** — Cloudflare in front of the API is encouraged for the dashboard's perspective but not strictly required
- **Not a backup strategy** — the indexer rebuilds from chain state on restart; backups of Postgres are nice-to-have, not critical

# syntax=docker/dockerfile:1.7

# =============================================================================
#  @filler-sdk/jit-hints — multi-stage container image
#
#  Build context: REPO ROOT (`docker build -f packages/jit-hints/Dockerfile .`).
#  The Dockerfile assumes the monorepo layout — it needs the workspace
#  package.json + bun.lock at the repo root to install per-workspace deps.
#
#  The image runs the HTTP API only (`bun src/server.ts`). The indexer
#  (`ponder start`) is intended to run in a sibling container that shares
#  `DATABASE_URL` with this one.  See the root `docker-compose.yml`.
# =============================================================================

# -----------------------------------------------------------------------------
# 1. Builder stage — installs deps + copies sources.
#
# Pinned to a specific bun version so reproducibility doesn't rely on `latest`.
# Alpine base keeps the install footprint small.
# -----------------------------------------------------------------------------
FROM oven/bun:1.3.10-alpine AS builder

WORKDIR /repo

# Workspace metadata first, so dep installs are cached as long as nothing in
# the dependency tree changes.
COPY package.json bun.lock pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/jit-hints/package.json ./packages/jit-hints/

# Install with the existing lockfile so versions match local + CI.
RUN bun install --frozen-lockfile

# Source.
COPY packages/jit-hints ./packages/jit-hints
COPY contracts/out/IPoolManager.sol/IPoolManager.json ./contracts/out/IPoolManager.sol/IPoolManager.json

# Generate ABIs from the contract artifact (deterministic — same inputs in,
# same TS file out — so layer caching works as long as the artifact is stable).
WORKDIR /repo/packages/jit-hints
RUN bun run scripts/gen-abis.ts

# -----------------------------------------------------------------------------
# 2. Runtime stage — minimal alpine + dumb-init + non-root user.
# -----------------------------------------------------------------------------
FROM oven/bun:1.3.10-alpine AS runtime

# `dumb-init` reaps zombie subprocesses and forwards signals correctly so
# SIGTERM reaches our graceful-shutdown handler. `curl` is used by HEALTHCHECK.
RUN apk add --no-cache dumb-init curl

# Drop to a non-root user — UID 1000 is the standard "first regular user" slot
# and matches what most kubernetes / fly.io / render.com defaults expect.
RUN addgroup -g 1000 -S app && \
    adduser -u 1000 -S app -G app

WORKDIR /app

# Copy only what the runtime needs — node_modules + source + auto-generated
# ABIs + config + schema. Tests + scripts are intentionally NOT copied.
COPY --from=builder --chown=app:app /repo/node_modules ./node_modules
COPY --from=builder --chown=app:app /repo/packages/jit-hints/package.json ./
COPY --from=builder --chown=app:app /repo/packages/jit-hints/src ./src
COPY --from=builder --chown=app:app /repo/packages/jit-hints/abis ./abis
COPY --from=builder --chown=app:app /repo/packages/jit-hints/ponder.config.ts ./
COPY --from=builder --chown=app:app /repo/packages/jit-hints/ponder.schema.ts ./
COPY --from=builder --chown=app:app /repo/packages/jit-hints/ponder-env.d.ts ./

USER app

# Production env defaults — overridable at `docker run` time.
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    PORT=42069 \
    HOST=0.0.0.0

# HEALTHCHECK against the API's `/health` endpoint. start-period=20s gives the
# process room to boot + warm up before the orchestrator starts marking it
# unhealthy. interval=30s + retries=3 = 90s total before container is killed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/health > /dev/null || exit 1

EXPOSE 42069

ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "run", "src/server.ts"]

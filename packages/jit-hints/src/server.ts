/**
 * Standalone HTTP API entrypoint for `@filler-sdk/jit-hints`.
 *
 * In production this process serves only the HTTP API; a separate
 * `ponder start` process indexes the chains and writes the same Postgres
 * the API reads from. Both share `DATABASE_URL`.
 *
 * Lifecycle:
 *   1. Validate env via `loadEnv()` (Zod-checked).
 *   2. Initialise optional Sentry + OpenTelemetry (no-ops without their SDKs).
 *   3. Build a `JitHintsDb`. For local dev with `DATABASE_URL` unset we serve a
 *      tiny in-memory mock so `docker compose up` reaches a green health check
 *      without first running the indexer; production callers MUST set
 *      `DATABASE_URL` and the operator wires the drizzle adapter.
 *   4. Compose the Hono app via `createApp({...})`.
 *   5. Bind to `PORT` / `HOST` via `@hono/node-server`.
 *   6. Register SIGTERM / SIGINT handlers — drains in-flight requests + closes
 *      the SSE handler's pool-event subscriptions before exit.
 *
 * Run:
 *   bun src/server.ts
 *
 * Env (see `.env.example`):
 *   PORT, HOST, LOG_LEVEL
 *   DATABASE_URL                    (production; in-memory if unset)
 *   SENTRY_DSN                      (optional; package not in deps)
 *   OTEL_EXPORTER_OTLP_ENDPOINT     (optional; package not in deps)
 */

import { serve } from '@hono/node-server';

import { createApp } from './api';
import { type JitHintsDb, createMockDb } from './api/db';
import { loadEnv } from './env';
import { logger } from './logger';
import { type SentryHooks, initSentry, noopSentryHooks } from './observability/sentry';
import {
  type TracingHooks,
  initTracing,
  noopTracingHooks,
} from './observability/tracing';

const SHUTDOWN_TIMEOUT_MS = 10_000;

interface BootResult {
  shutdown: (signal: string) => Promise<void>;
}

export async function boot(): Promise<BootResult> {
  const env = loadEnv();

  logger.info(
    { port: env.PORT, host: env.HOST, hasDatabase: env.DATABASE_URL !== undefined },
    'jit-hints HTTP API booting',
  );

  // === Optional integrations ===
  let sentry: SentryHooks = noopSentryHooks;
  let tracing: TracingHooks = noopTracingHooks;
  try {
    sentry = await initSentry({
      dsn: process.env['SENTRY_DSN'] ?? '',
      environment: process.env['NODE_ENV'] ?? 'development',
    });
    tracing = await initTracing({
      endpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? '',
    });
  } catch (err) {
    logger.warn({ err }, 'optional integration init failed');
  }

  // === DB adapter ===
  const db = await buildDb(env.DATABASE_URL);

  // === HTTP app ===
  const { app } = createApp({ db, logger });

  const server = serve(
    { fetch: app.fetch, port: env.PORT, hostname: env.HOST },
    (info) => {
      logger.info(
        { port: info.port, host: env.HOST, version: env.LOG_LEVEL },
        'jit-hints HTTP API listening',
      );
    },
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // Race the graceful close against a hard deadline so a wedged connection
    // can't keep the container alive forever.
    const close = new Promise<void>((resolve) => server.close(() => resolve()));
    const deadline = new Promise<void>((resolve) =>
      setTimeout(resolve, SHUTDOWN_TIMEOUT_MS).unref?.(),
    );
    await Promise.race([close, deadline]);

    try {
      await sentry.shutdown(2_000);
      await tracing.shutdown();
    } catch (err) {
      logger.warn({ err }, 'optional-integration shutdown failed');
    }
    logger.info('shutdown complete');
  };

  return { shutdown };
}

/**
 * Build the data adapter. Without `DATABASE_URL` we serve an empty in-memory
 * mock — useful for `docker compose up` to reach a green health check before
 * the operator points us at a real Postgres. Production deployments MUST set
 * `DATABASE_URL` and would normally swap this out for `createDrizzleDb`.
 */
async function buildDb(databaseUrl?: string): Promise<JitHintsDb> {
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    logger.warn(
      'DATABASE_URL not set — serving in-memory mock DB. Operators must set it for production.',
    );
    return createMockDb({ pools: [], ticks: [], chainStatus: [] });
  }

  // Real production wiring would import drizzle-orm/node-postgres + the schema
  // and call `createDrizzleDb(db, schema)`. We don't take that dep here in v0
  // (the API can also run as a Ponder API extension via `ponder:api`); see
  // Plan 09 progress §3 for the operator activation path.
  logger.warn(
    { databaseUrl: '<redacted>' },
    'DATABASE_URL is set but createDrizzleDb is not wired in v0 — falling back to mock',
  );
  return createMockDb({ pools: [], ticks: [], chainStatus: [] });
}

// === Entrypoint guard — only run when invoked directly (not when imported by tests) ===
const invokedDirectly = (() => {
  try {
    // Bun + Node both expose `process.argv[1]` as the script path. Compare the
    // module URL to that path to decide whether we're the entrypoint.
    const argv1 = process.argv[1];
    if (typeof argv1 !== 'string') return false;
    const url = import.meta.url;
    return url.endsWith(argv1) || url === `file://${argv1}`;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  void (async () => {
    const { shutdown } = await boot();
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM').then(() => process.exit(0));
    });
    process.on('SIGINT', () => {
      void shutdown('SIGINT').then(() => process.exit(0));
    });
  })();
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Logger } from 'pino';

import type { JitHintsDb } from './db';
import { type JitHintsMetrics, createMetrics } from './metrics';
import { createLoggingMiddleware } from './middleware/logging';
import { type RateLimiter, createRateLimiter } from './middleware/rateLimit';
import { createDepthRoute } from './routes/depth';
import { createHealthRoute } from './routes/health';
import { createPoolsRoute } from './routes/pools';

export interface AppOptions {
  db: JitHintsDb;
  /** Production callers pass a real pino logger; tests can pass a no-op. */
  logger?: Pick<Logger, 'info' | 'error'>;
  /** Optional injection point for tests. Defaults to a fresh registry. */
  metrics?: JitHintsMetrics;
  /** CORS allow-list. Defaults to `*` for development. */
  corsOrigin?: string | string[];
  /** Rate limiter knobs. */
  rateLimit?: { rps: number; burst: number };
  /** Depth-cache knobs (passed through to the LRU). */
  depthCache?: { ttlMs?: number; max?: number };
}

export interface JitHintsApp {
  app: Hono;
  metrics: JitHintsMetrics;
  rateLimiter: RateLimiter;
}

/**
 * Compose the full HTTP app. Caller is responsible for binding it to an HTTP
 * server (`@hono/node-server`) and for the lifecycle of the underlying `db`.
 *
 * The Hono app is reusable: `app.request(req)` works in tests; `serve({fetch:
 * app.fetch})` boots a real HTTP server in production.
 */
export function createApp(opts: AppOptions): JitHintsApp {
  const metrics = opts.metrics ?? createMetrics();
  const logger = opts.logger ?? noopLogger();

  const rateLimiter = createRateLimiter({
    rps: opts.rateLimit?.rps ?? 100,
    burst: opts.rateLimit?.burst ?? 50,
  });

  const app = new Hono();

  // Order matters: secure headers + CORS + logging fire on EVERY request,
  // including 4xx routes, so observability stays accurate. Rate limiting is
  // scoped to expensive endpoints below.
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: opts.corsOrigin ?? '*',
      allowMethods: ['GET'],
      maxAge: 600,
    }),
  );
  app.use('*', createLoggingMiddleware(logger, metrics));

  // Rate-limited routes (depth queries are the hot path).
  app.use('/depth', rateLimiter.middleware);

  // Mount route groups.
  app.route('/', createHealthRoute({ db: opts.db }));
  app.route(
    '/',
    createDepthRoute({
      db: opts.db,
      metrics,
      ...(opts.depthCache?.ttlMs !== undefined ? { cacheTtlMs: opts.depthCache.ttlMs } : {}),
      ...(opts.depthCache?.max !== undefined ? { cacheMax: opts.depthCache.max } : {}),
    }),
  );
  app.route('/', createPoolsRoute({ db: opts.db }));

  // Prometheus exposition.
  app.get('/metrics', async (c) => {
    const body = await metrics.registry.metrics();
    return c.text(body, 200, { 'Content-Type': metrics.registry.contentType });
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.onError((err, c) => {
    logger.error({ err, path: c.req.path }, 'unhandled error');
    return c.json({ error: 'Internal server error' }, 500);
  });

  return { app, metrics, rateLimiter };
}

function noopLogger(): Pick<Logger, 'info' | 'error'> {
  return {
    info() {},
    error() {},
  };
}

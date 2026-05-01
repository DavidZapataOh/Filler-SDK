import type { MiddlewareHandler } from 'hono';
import type { Logger } from 'pino';

import type { JitHintsMetrics } from '../metrics';

/**
 * Records an HTTP-line log + Prometheus counters/histograms for every request.
 * The route label uses Hono's matched-route pattern (e.g. `/pools/:id`) so
 * cardinality doesn't explode with poolId variations.
 */
export function createLoggingMiddleware(
  logger: Pick<Logger, 'info' | 'error'>,
  metrics: JitHintsMetrics,
): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    let status = 0;
    try {
      await next();
      status = c.res.status;
    } catch (err) {
      status = 500;
      logger.error({ err, path: c.req.path }, 'request errored');
      throw err;
    } finally {
      const elapsedMs = performance.now() - start;
      const route = c.req.routePath || c.req.path;
      logger.info(
        {
          method: c.req.method,
          route,
          path: c.req.path,
          status,
          durationMs: Number(elapsedMs.toFixed(3)),
        },
        'http',
      );
      metrics.requestsTotal.inc({ route, status: String(status) });
      metrics.requestDurationSeconds.observe({ route }, elapsedMs / 1000);
    }
  };
}

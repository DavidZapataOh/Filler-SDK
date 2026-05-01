import { Hono } from 'hono';

import { JIT_HINTS_VERSION } from '../../index';
import type { JitHintsDb } from '../db';
import { serializeChainStatus } from '../serializers';

export interface HealthRouteDeps {
  db: JitHintsDb;
  /** Returned in the response so monitoring can correlate restarts. */
  startedAt?: number;
}

/**
 * GET /health — liveness + per-chain index status.
 *
 * Returns 200 unconditionally (process-level liveness). For readiness
 * (degrade when a chain is stale), monitoring should call `chainStatus()`
 * and check `latestBlock` freshness against the chain's expected tip.
 */
export function createHealthRoute(deps: HealthRouteDeps): Hono {
  const app = new Hono();
  const startedAt = deps.startedAt ?? Date.now();

  app.get('/health', async (c) => {
    const chains = await deps.db.chainStatus();
    return c.json({
      status: 'ok',
      version: JIT_HINTS_VERSION,
      startedAt,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      chains: chains.map(serializeChainStatus),
    });
  });

  return app;
}

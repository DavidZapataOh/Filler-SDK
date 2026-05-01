import { Hono } from 'hono';
import { LRUCache } from 'lru-cache';

import { type DepthHint, calculateDepthHint } from '../../depth/calculator';
import type { JitHintsDb } from '../db';
import type { JitHintsMetrics } from '../metrics';
import { DepthQuerySchema } from '../schemas';
import { serializeDepthHint } from '../serializers';

export interface DepthRouteDeps {
  db: JitHintsDb;
  metrics: JitHintsMetrics;
  /** TTL for cached hints; pool state changes fast so a short TTL is correct. */
  cacheTtlMs?: number;
  /** Max distinct cache entries. */
  cacheMax?: number;
}

/**
 * GET /depth — primary JIT-hint endpoint.
 *
 * Inputs (query string, all required unless noted):
 *   pool        — 0x-prefixed 32-byte poolId
 *   size        — non-negative integer string (input-token wei)
 *   zeroForOne  — 'true' | 'false'
 *   slippageBps — int 1..10000 (default 50)
 *   gasPriceWei — optional integer string
 *   gasOverhead — optional integer string
 *
 * Responses:
 *   200 — `SerializedDepthHint`
 *   400 — Zod validation failure
 *   404 — pool not indexed
 */
export function createDepthRoute(deps: DepthRouteDeps): Hono {
  const cache = new LRUCache<string, DepthHint>({
    max: deps.cacheMax ?? 10_000,
    ttl: deps.cacheTtlMs ?? 200,
    updateAgeOnGet: true,
  });

  const app = new Hono();

  app.get('/depth', async (c) => {
    const parsed = DepthQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid query parameters', issues: parsed.error.issues },
        400,
      );
    }

    const { pool, size, zeroForOne, slippageBps, gasPriceWei, gasOverhead } =
      parsed.data;

    const cacheKey = `${pool}|${size}|${zeroForOne}|${slippageBps}|${gasPriceWei ?? '-'}|${gasOverhead ?? '-'}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      deps.metrics.depthCacheHits.inc({ kind: 'hit' });
      return c.json(serializeDepthHint(pool, cached));
    }
    deps.metrics.depthCacheHits.inc({ kind: 'miss' });

    const poolRow = await deps.db.findPool(pool as `0x${string}`);
    if (poolRow === null) {
      return c.json({ error: 'Pool not indexed', poolId: pool }, 404);
    }

    const ticks = await deps.db.findTicksForPool(pool as `0x${string}`);

    const hint = calculateDepthHint(poolRow, ticks, {
      poolId: pool as `0x${string}`,
      tradeSize: BigInt(size),
      zeroForOne,
      slippageBps,
      ...(gasPriceWei !== undefined ? { gasPriceWei: BigInt(gasPriceWei) } : {}),
      ...(gasOverhead !== undefined ? { gasOverhead: BigInt(gasOverhead) } : {}),
    });

    cache.set(cacheKey, hint);
    return c.json(serializeDepthHint(pool, hint));
  });

  return app;
}

import { Hono } from 'hono';

import type { JitHintsDb } from '../db';
import { PoolIdParamSchema, PoolListSchema } from '../schemas';
import { serializePool } from '../serializers';

export interface PoolsRouteDeps {
  db: JitHintsDb;
}

/**
 * Mounts:
 *   GET /pools         — paginated list with optional chain + token filters
 *   GET /pools/:id     — single-pool detail
 */
export function createPoolsRoute(deps: PoolsRouteDeps): Hono {
  const app = new Hono();

  app.get('/pools', async (c) => {
    const parsed = PoolListSchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid query parameters', issues: parsed.error.issues },
        400,
      );
    }
    const { chain, token, limit, offset } = parsed.data;
    const rows = await deps.db.queryPools({
      ...(chain !== undefined ? { chainId: chain } : {}),
      ...(token !== undefined ? { token: token as `0x${string}` } : {}),
      limit,
      offset,
    });
    return c.json({
      pools: rows.map(serializePool),
      count: rows.length,
      limit,
      offset,
    });
  });

  app.get('/pools/:id', async (c) => {
    const parsed = PoolIdParamSchema.safeParse({ id: c.req.param('id') });
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid pool id', issues: parsed.error.issues },
        400,
      );
    }
    const pool = await deps.db.findPool(parsed.data.id as `0x${string}`);
    if (pool === null) return c.json({ error: 'Pool not indexed' }, 404);
    return c.json(serializePool(pool));
  });

  return app;
}

import { describe, expect, test } from 'vitest';

import { createApp } from '../../src/api';
import { POOL_A, POOL_B, TOKEN_USDC, TOKEN_WBTC, buildMockDb } from './fixtures';

describe('GET /pools', () => {
  test('returns the full list with no filters', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request('http://t/pools');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pools: { id: string }[]; count: number };
    expect(body.count).toBe(2);
    expect(body.pools.map((p) => p.id).sort()).toEqual([POOL_A, POOL_B].sort());
  });

  test('filters by chain', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request('http://t/pools?chain=130');
    const body = (await res.json()) as { pools: { id: string; chainId: number }[] };
    expect(body.pools).toHaveLength(1);
    expect(body.pools[0]?.chainId).toBe(130);
  });

  test('filters by token (matches currency0 or currency1)', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request(`http://t/pools?token=${TOKEN_USDC}`);
    const body = (await res.json()) as { pools: { id: string }[] };
    expect(body.pools).toHaveLength(1);
    expect(body.pools[0]?.id).toBe(POOL_A);
  });

  test('honors limit + offset', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request('http://t/pools?limit=1&offset=1');
    const body = (await res.json()) as { count: number; offset: number; limit: number };
    expect(body.count).toBe(1);
    expect(body.offset).toBe(1);
    expect(body.limit).toBe(1);
  });

  test('400 on bad token format', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request('http://t/pools?token=0xnope');
    expect(res.status).toBe(400);
  });

  test('400 on bad limit', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request('http://t/pools?limit=101');
    expect(res.status).toBe(400);
  });
});

describe('GET /pools/:id', () => {
  test('returns 200 + serialized pool', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request(`http://t/pools/${POOL_A}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; sqrtPriceX96: string };
    expect(body.id).toBe(POOL_A);
    expect(typeof body.sqrtPriceX96).toBe('string');
  });

  test('returns 400 on bad id format', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request('http://t/pools/0xabc');
    expect(res.status).toBe(400);
  });

  test('returns 404 on unknown pool', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const unknown = '0x' + '0'.repeat(64);
    const res = await app.request(`http://t/pools/${unknown}`);
    expect(res.status).toBe(404);
  });

  test('does NOT match WBTC token because no pool uses both USDC + WBTC', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request(`http://t/pools?token=${TOKEN_WBTC}`);
    const body = (await res.json()) as { pools: { id: string }[] };
    expect(body.pools.map((p) => p.id)).toEqual([POOL_B]);
  });
});

import { beforeEach, describe, expect, test } from 'vitest';

import { createApp } from '../../src/api';
import { POOL_A, buildMockDb } from './fixtures';

describe('GET /depth', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp({ db: buildMockDb() });
  });

  test('returns 200 + serialized hint for valid params', async () => {
    const url = `http://t/depth?pool=${POOL_A}&size=1000000000000000000&zeroForOne=true&slippageBps=50`;
    const res = await app.app.request(url);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.pool).toBe(POOL_A);
    expect(body.hint).toBeDefined();
    const hint = body.hint as Record<string, unknown>;
    expect(typeof hint.tickLower).toBe('number');
    expect(typeof hint.tickUpper).toBe('number');
    expect(typeof hint.liquidityDelta).toBe('string'); // BigInt → string
    expect(typeof hint.expectedFeeCapture).toBe('string');
  });

  test('returns 400 on missing pool', async () => {
    const res = await app.app.request('http://t/depth?size=1&zeroForOne=true');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toMatch(/Invalid query/);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  test('returns 400 on malformed pool id', async () => {
    const res = await app.app.request('http://t/depth?pool=0xnope&size=1&zeroForOne=true');
    expect(res.status).toBe(400);
  });

  test('returns 400 on malformed size', async () => {
    const res = await app.app.request(
      `http://t/depth?pool=${POOL_A}&size=NaN&zeroForOne=true`,
    );
    expect(res.status).toBe(400);
  });

  test('returns 400 on out-of-range slippageBps', async () => {
    const res = await app.app.request(
      `http://t/depth?pool=${POOL_A}&size=1&zeroForOne=true&slippageBps=99999`,
    );
    expect(res.status).toBe(400);
  });

  test('returns 404 when pool is not indexed', async () => {
    const unknown = '0x' + '0'.repeat(64);
    const res = await app.app.request(
      `http://t/depth?pool=${unknown}&size=1000000&zeroForOne=true`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not indexed/i);
  });

  test('cache-hit increments depthCacheHits{kind="hit"}', async () => {
    const url = `http://t/depth?pool=${POOL_A}&size=1000000&zeroForOne=true&slippageBps=50`;
    await app.app.request(url);
    await app.app.request(url); // 2nd hit should come from cache
    const text = await app.metrics.registry.metrics();
    expect(text).toMatch(/jit_hints_depth_cache_hits_total\{kind="hit"\} 1/);
    expect(text).toMatch(/jit_hints_depth_cache_hits_total\{kind="miss"\} 1/);
  });

  test('different cache keys produce two misses', async () => {
    await app.app.request(
      `http://t/depth?pool=${POOL_A}&size=1000000&zeroForOne=true&slippageBps=50`,
    );
    await app.app.request(
      `http://t/depth?pool=${POOL_A}&size=2000000&zeroForOne=true&slippageBps=50`,
    );
    const text = await app.metrics.registry.metrics();
    expect(text).toMatch(/jit_hints_depth_cache_hits_total\{kind="miss"\} 2/);
  });
});

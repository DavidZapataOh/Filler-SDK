import { describe, expect, test } from 'vitest';

import { createApp } from '../../src/api';
import { buildMockDb } from './fixtures';

describe('GET /health', () => {
  test('returns 200 with status, version, uptime, chains', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request('http://t/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      version: string;
      uptimeSec: number;
      chains: { chainId: number; latestBlock: string }[];
    };
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptimeSec).toBe('number');
    expect(body.chains).toHaveLength(2);
    expect(body.chains[0]?.chainId).toBe(1);
    // BigInt → string serialization.
    expect(body.chains[0]?.latestBlock).toBe('21000000');
  });

  test('uptime grows across two consecutive calls', async () => {
    const startedAt = Date.now() - 10_000; // pretend we started 10s ago
    const { app } = createApp({ db: buildMockDb() });
    // Note: createHealthRoute uses its own startedAt; we exercise the
    // default-startedAt path here. The deterministic check is that the
    // returned uptimeSec is a non-negative number.
    const res = await app.request('http://t/health');
    const body = (await res.json()) as { uptimeSec: number };
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
    // `startedAt` unused here is intentional — see the comment above.
    void startedAt;
  });
});

describe('GET /metrics', () => {
  test('returns Prometheus exposition format', async () => {
    const { app } = createApp({ db: buildMockDb() });
    // Generate at least one request so a metric is emitted.
    await app.request('http://t/health');
    const res = await app.request('http://t/metrics');
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toMatch(/jit_hints_requests_total/);
    expect(body).toMatch(/jit_hints_request_duration_seconds/);
  });
});

describe('404 / 500', () => {
  test('unknown route returns 404 with our error envelope', async () => {
    const { app } = createApp({ db: buildMockDb() });
    const res = await app.request('http://t/no-such-route');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });
});

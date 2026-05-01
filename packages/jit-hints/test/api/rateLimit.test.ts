import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';

import { createRateLimiter } from '../../src/api/middleware/rateLimit';

function buildApp(rps: number, burst: number, now: () => number) {
  const limiter = createRateLimiter({ rps, burst, now });
  const app = new Hono();
  app.use('*', limiter.middleware);
  app.get('/test', (c) => c.text('ok'));
  return { app, limiter };
}

function makeReq(ip: string): Request {
  return new Request('http://t/test', {
    headers: { 'x-forwarded-for': ip },
  });
}

describe('createRateLimiter', () => {
  test('passes the first `burst` requests and rejects the next one', async () => {
    let t = 0;
    const { app } = buildApp(10, 3, () => t);
    const req = () => app.request(makeReq('1.2.3.4'));

    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(200);
    const blocked = await req();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('1');
  });

  test('refills after time passes', async () => {
    let t = 0;
    const { app } = buildApp(10, 1, () => t);
    expect((await app.request(makeReq('5.5.5.5'))).status).toBe(200);
    expect((await app.request(makeReq('5.5.5.5'))).status).toBe(429);
    // 0.2s @ 10rps = 2 tokens (capped at burst=1) → 1 token available.
    t = 200;
    expect((await app.request(makeReq('5.5.5.5'))).status).toBe(200);
  });

  test('separate IPs have separate buckets', async () => {
    let t = 0;
    const { app } = buildApp(10, 1, () => t);
    expect((await app.request(makeReq('a'))).status).toBe(200);
    expect((await app.request(makeReq('b'))).status).toBe(200);
    expect((await app.request(makeReq('a'))).status).toBe(429);
    expect((await app.request(makeReq('b'))).status).toBe(429);
  });

  test('prune drops idle buckets', async () => {
    let t = 0;
    const { app, limiter } = buildApp(10, 1, () => t);
    await app.request(makeReq('idle-ip'));
    expect(limiter.size()).toBe(1);
    t = 6 * 60_000; // 6 minutes — past the 5-minute default idle window
    const dropped = limiter.prune();
    expect(dropped).toBe(1);
    expect(limiter.size()).toBe(0);
  });

  test('prune respects custom idle window', async () => {
    let t = 0;
    const { app, limiter } = buildApp(10, 1, () => t);
    await app.request(makeReq('hot'));
    t = 30_000;
    expect(limiter.prune(60_000)).toBe(0);
    expect(limiter.prune(15_000)).toBe(1);
  });

  test('falls back to "unknown" when no IP headers are present', async () => {
    let t = 0;
    const { app, limiter } = buildApp(10, 1, () => t);
    const req = new Request('http://t/test'); // no headers
    expect((await app.request(req)).status).toBe(200);
    expect(limiter.size()).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApp } from '../../src/api';
import { type PoolEvents, TypedEventBus } from '../../src/events/bus';
import { POOL_A, buildMockDb } from './fixtures';

interface SSEEvent {
  event?: string;
  data: string;
}

/** Poll the snapshot metric until ≥ 1, signalling that the SSE handler has
 *  finished its initial-snapshot write and `snapshotDone = true`. The test
 *  needs this barrier before emitting pool events; otherwise the listener
 *  silently drops them as "pre-snapshot". */
async function waitForSnapshot(
  metrics: ReturnType<typeof createApp>['metrics'],
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = await metrics.sseEventsTotal.get();
    const snap = m.values.find((v) => v.labels.type === 'snapshot')?.value ?? 0;
    if (snap >= 1) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('snapshot was not emitted within timeout');
}

/**
 * Read SSE-formatted bytes from a Response body until at least `count` events
 * are observed or the stream closes. Each event ends with a blank line.
 */
async function readEvents(
  response: Response,
  count: number,
  timeoutMs = 2_000,
): Promise<{ events: SSEEvent[]; reader: ReadableStreamDefaultReader<Uint8Array> }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: SSEEvent[] = [];
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  while (events.length < count && Date.now() < deadline) {
    const readPromise = reader.read();
    const timeoutPromise = new Promise<{ done: true; value: undefined }>((r) =>
      setTimeout(() => r({ done: true, value: undefined }), Math.max(50, deadline - Date.now())),
    );
    const { value, done } = await Promise.race([readPromise, timeoutPromise]);
    if (done) break;
    if (value === undefined) continue;
    buffer += decoder.decode(value, { stream: true });

    // Split into complete events on the SSE blank-line separator.
    let blank;
    while ((blank = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, blank);
      buffer = buffer.slice(blank + 2);
      if (block.trim().length === 0) continue;
      const parsed: SSEEvent = { data: '' };
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) parsed.event = line.slice(6).trim();
        else if (line.startsWith('data:')) parsed.data += line.slice(5).trim();
      }
      events.push(parsed);
      if (events.length >= count) break;
    }
  }

  return { events, reader };
}

describe('GET /depth/stream', () => {
  let bus: TypedEventBus<PoolEvents>;

  beforeEach(() => {
    bus = new TypedEventBus<PoolEvents>();
  });

  test('returns 400 on missing query params', async () => {
    const { app } = createApp({ db: buildMockDb(), eventBus: bus });
    const res = await app.request('http://t/depth/stream');
    expect(res.status).toBe(400);
  });

  test('returns 400 on malformed pool id', async () => {
    const { app } = createApp({ db: buildMockDb(), eventBus: bus });
    const res = await app.request(
      'http://t/depth/stream?pool=0xnope&size=1&zeroForOne=true',
    );
    expect(res.status).toBe(400);
  });

  test('emits initial snapshot for known pool', async () => {
    const { app, metrics } = createApp({ db: buildMockDb(), eventBus: bus });
    const res = await app.request(
      `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const { events, reader } = await readEvents(res, 1);
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('depth');
    const payload = JSON.parse(events[0]!.data) as { pool: string; hint: object };
    expect(payload.pool).toBe(POOL_A);
    expect(payload.hint).toBeDefined();
    const gauge = await metrics.sseActiveConnections.get();
    expect(gauge.values[0]?.value).toBe(1);

    await reader.cancel();
  });

  test('emits update when pool:swap fires for the same pool', async () => {
    let mockTime = 0;
    const { app, metrics } = createApp({
      db: buildMockDb(),
      eventBus: bus,
      sse: { throttleMs: 50, now: () => mockTime },
    });
    const res = await app.request(
      `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`,
    );

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read(); // first chunk = snapshot
    await waitForSnapshot(metrics);

    // Emit a swap on the same pool. Advance the clock past throttle so the
    // listener actually emits.
    mockTime = 100;
    bus.emit('pool:swap', {
      poolId: POOL_A,
      chainId: 1,
      blockNumber: 21_000_001n,
      sqrtPriceX96: 1n,
      tick: 0,
    });

    // Pull the next chunk; it must be the update event.
    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain('event: depth');

    await reader.cancel();
  });

  test('throttle drops events that arrive too fast', async () => {
    let mockTime = 0;
    const { app, metrics } = createApp({
      db: buildMockDb(),
      eventBus: bus,
      sse: { throttleMs: 1_000, now: () => mockTime },
    });
    const res = await app.request(
      `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`,
    );

    const reader = res.body!.getReader();
    await reader.read(); // snapshot consumes one read
    await waitForSnapshot(metrics);

    // Emit two events within the throttle window; only one should slip through.
    mockTime = 5; // tiny delta — inside throttle
    bus.emit('pool:swap', {
      poolId: POOL_A,
      chainId: 1,
      blockNumber: 21_000_001n,
      sqrtPriceX96: 1n,
      tick: 0,
    });
    bus.emit('pool:swap', {
      poolId: POOL_A,
      chainId: 1,
      blockNumber: 21_000_002n,
      sqrtPriceX96: 1n,
      tick: 0,
    });

    // Give the bus listeners a tick to run.
    await new Promise((r) => setTimeout(r, 10));

    // The second emit was within the throttle window → dropped counter +1.
    const droppedMetric = await metrics.sseDroppedTotal.get();
    const dropped =
      droppedMetric.values.find((v) => v.labels.reason === 'throttle')?.value ?? 0;
    expect(dropped).toBeGreaterThanOrEqual(1);

    await reader.cancel();
  });

  test('events for a different pool are not delivered', async () => {
    const { app, metrics } = createApp({
      db: buildMockDb(),
      eventBus: bus,
      sse: { throttleMs: 0 },
    });
    const res = await app.request(
      `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`,
    );

    const reader = res.body!.getReader();
    await reader.read(); // snapshot
    await waitForSnapshot(metrics);

    // Emit on a DIFFERENT pool — the listener filters by poolId.
    const OTHER = '0x' + 'c'.repeat(64);
    bus.emit('pool:swap', {
      poolId: OTHER as `0x${string}`,
      chainId: 1,
      blockNumber: 21_000_001n,
      sqrtPriceX96: 1n,
      tick: 0,
    });

    await new Promise((r) => setTimeout(r, 10));

    // No `update` events should have been emitted; updates counter stays at 0.
    const eventsMetric = await metrics.sseEventsTotal.get();
    const updates =
      eventsMetric.values.find((v) => v.labels.type === 'update')?.value ?? 0;
    expect(updates).toBe(0);

    await reader.cancel();
  });

  test('emits error event + closes stream when pool is unknown', async () => {
    const { app } = createApp({ db: buildMockDb(), eventBus: bus });
    const unknown = '0x' + '0'.repeat(64);
    const res = await app.request(
      `http://t/depth/stream?pool=${unknown}&size=1000000&zeroForOne=true`,
    );
    expect(res.status).toBe(200); // SSE always 200; error is in-band

    const { events } = await readEvents(res, 1);
    expect(events[0]?.event).toBe('error');
    const payload = JSON.parse(events[0]!.data) as { error: string };
    expect(payload.error).toMatch(/not indexed/i);
  });

  test('respects maxConnections — additional clients get 503', async () => {
    const { app, metrics } = createApp({
      db: buildMockDb(),
      eventBus: bus,
      sse: { maxConnections: 1 },
    });

    const url = `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`;
    const first = await app.request(url);
    expect(first.status).toBe(200);
    const reader = first.body!.getReader();
    await reader.read(); // ensure snapshot has been emitted (gauge incremented)

    const second = await app.request(url);
    expect(second.status).toBe(503);
    const body = (await second.json()) as { error: string };
    expect(body.error).toMatch(/capacity/i);

    const droppedMetric = await metrics.sseDroppedTotal.get();
    const dropped =
      droppedMetric.values.find((v) => v.labels.reason === 'capacity')?.value ?? 0;
    expect(dropped).toBeGreaterThanOrEqual(1);

    await reader.cancel();
  });

  test('decrements active connection gauge on disconnect', async () => {
    const { app, metrics } = createApp({ db: buildMockDb(), eventBus: bus });
    const res = await app.request(
      `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`,
    );
    const reader = res.body!.getReader();
    await reader.read();
    const gauge = await metrics.sseActiveConnections.get();
    expect(gauge.values[0]?.value).toBe(1);

    await reader.cancel();
    // Give the abort handler a tick to fire.
    await new Promise((r) => setTimeout(r, 50));
    const after = await metrics.sseActiveConnections.get();
    expect(after.values[0]?.value).toBe(0);
  });
});

afterEach(async () => {
  // Make sure no hanging streams keep the process alive.
  await new Promise((r) => setTimeout(r, 0));
});

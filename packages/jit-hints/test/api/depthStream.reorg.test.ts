import { beforeEach, describe, expect, test } from 'vitest';

import { createApp } from '../../src/api';
import { type PoolEvents, TypedEventBus } from '../../src/events/bus';
import { POOL_A, buildMockDb } from './fixtures';

/** Wait for the snapshot metric to register, signalling `snapshotDone = true`
 *  inside the SSE handler. Only then will event-driven listeners fire. */
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

describe('GET /depth/stream — reorg refresh', () => {
  let bus: TypedEventBus<PoolEvents>;

  beforeEach(() => {
    bus = new TypedEventBus<PoolEvents>();
  });

  test('emits reorg-refresh event when pool:reorg fires for the pool chain', async () => {
    let mockTime = 0;
    const { app, metrics } = createApp({
      db: buildMockDb(),
      eventBus: bus,
      sse: { throttleMs: 5_000, now: () => mockTime }, // big throttle to prove bypass
    });
    const res = await app.request(
      `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`,
    );
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read();
    await waitForSnapshot(metrics);

    // Reorg on the same chain as POOL_A (chainId=1 in the mock fixture).
    bus.emit('pool:reorg', {
      chainId: 1,
      fromBlock: 21_000_010n,
      toBlock: 21_000_005n,
      depth: 5,
    });

    // The reorg path bypasses throttle, so even with a 5_000 ms throttle the
    // refresh should land immediately.
    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain('event: depth');

    // The metric counter increments AFTER writeSSE awaits — give the listener
    // a microtask tick to run its post-write `.inc(...)` line before reading.
    await new Promise((r) => setTimeout(r, 10));

    // Counter labelled `reorg-refresh` increments.
    const events = await metrics.sseEventsTotal.get();
    const refresh = events.values.find((v) => v.labels.type === 'reorg-refresh');
    expect(refresh?.value ?? 0).toBeGreaterThanOrEqual(1);

    // Also: the global reorg counter incremented (via the reorgObserver bridge).
    const reorgs = await metrics.reorgEventsTotal.get();
    const r = reorgs.values.find(
      (v) => v.labels.chainId === '1' && v.labels.depthBucket === '4-7',
    );
    expect(r?.value).toBe(1);

    await reader.cancel();
  });

  test('reorg on a different chain does NOT trigger refresh', async () => {
    const { app, metrics } = createApp({
      db: buildMockDb(),
      eventBus: bus,
    });
    const res = await app.request(
      `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`,
    );
    const reader = res.body!.getReader();
    await reader.read();
    await waitForSnapshot(metrics);

    // POOL_A is on chainId=1 in the mock; reorg fires on chainId=999.
    bus.emit('pool:reorg', {
      chainId: 999,
      fromBlock: 100n,
      toBlock: 95n,
      depth: 5,
    });

    // Give the listener a tick to evaluate.
    await new Promise((r) => setTimeout(r, 50));

    const events = await metrics.sseEventsTotal.get();
    const refresh = events.values.find((v) => v.labels.type === 'reorg-refresh');
    // No reorg-refresh emitted for our pool (it's on a different chain).
    expect(refresh?.value ?? 0).toBe(0);

    // The bridge still counts the reorg telemetry-wise, regardless of pool chain.
    const reorgs = await metrics.reorgEventsTotal.get();
    const r = reorgs.values.find((v) => v.labels.chainId === '999');
    expect(r?.value).toBe(1);

    await reader.cancel();
  });

  test('cleanup unsubscribes pool:reorg listener on disconnect', async () => {
    const { app, metrics } = createApp({
      db: buildMockDb(),
      eventBus: bus,
    });
    const res = await app.request(
      `http://t/depth/stream?pool=${POOL_A}&size=1000000&zeroForOne=true`,
    );
    const reader = res.body!.getReader();
    await reader.read();
    await waitForSnapshot(metrics);

    // Two listeners registered: pool:swap, pool:liquidity-changed, pool:reorg
    // (the last is the SSE handler's reorg listener) PLUS the reorgObserver
    // bridge (also registered for pool:reorg). So listenerCount('pool:reorg')
    // should be 2 while the stream is open.
    expect(bus.listenerCount('pool:reorg')).toBe(2);

    await reader.cancel();
    await new Promise((r) => setTimeout(r, 50));

    // After abort, the SSE handler unregisters; only the reorgObserver remains.
    expect(bus.listenerCount('pool:reorg')).toBe(1);
  });
});

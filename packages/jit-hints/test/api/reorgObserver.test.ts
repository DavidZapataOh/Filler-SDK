import { beforeEach, describe, expect, test } from 'vitest';

import { type PoolEvents, TypedEventBus } from '../../src/events/bus';
import { createMetrics, reorgDepthBucket } from '../../src/api/metrics';
import { createReorgObserver } from '../../src/api/reorgObserver';

describe('reorgDepthBucket', () => {
  test('partitions depth into the documented buckets', () => {
    expect(reorgDepthBucket(1)).toBe('1-3');
    expect(reorgDepthBucket(3)).toBe('1-3');
    expect(reorgDepthBucket(4)).toBe('4-7');
    expect(reorgDepthBucket(7)).toBe('4-7');
    expect(reorgDepthBucket(8)).toBe('8-12');
    expect(reorgDepthBucket(12)).toBe('8-12');
    expect(reorgDepthBucket(13)).toBe('>12');
    expect(reorgDepthBucket(100)).toBe('>12');
  });

  test('clamps zero / negative to the smallest bucket (defensive)', () => {
    expect(reorgDepthBucket(0)).toBe('1-3');
    expect(reorgDepthBucket(-5)).toBe('1-3');
  });
});

describe('createReorgObserver', () => {
  let bus: TypedEventBus<PoolEvents>;
  let metrics: ReturnType<typeof createMetrics>;

  beforeEach(() => {
    bus = new TypedEventBus<PoolEvents>();
    metrics = createMetrics();
  });

  test('increments reorgEventsTotal when pool:reorg is emitted', async () => {
    createReorgObserver(bus, metrics);

    bus.emit('pool:reorg', {
      chainId: 130,
      fromBlock: 1_000_000n,
      toBlock: 999_990n,
      depth: 10,
    });

    const m = await metrics.reorgEventsTotal.get();
    const v = m.values.find(
      (x) => x.labels.chainId === '130' && x.labels.depthBucket === '8-12',
    );
    expect(v?.value).toBe(1);
  });

  test('separate chainId labels are tracked independently', async () => {
    createReorgObserver(bus, metrics);

    bus.emit('pool:reorg', {
      chainId: 1,
      fromBlock: 21_000_000n,
      toBlock: 20_999_999n,
      depth: 1,
    });
    bus.emit('pool:reorg', {
      chainId: 130,
      fromBlock: 5_000n,
      toBlock: 4_995n,
      depth: 5,
    });

    const m = await metrics.reorgEventsTotal.get();
    const mainnet = m.values.find(
      (x) => x.labels.chainId === '1' && x.labels.depthBucket === '1-3',
    );
    const unichain = m.values.find(
      (x) => x.labels.chainId === '130' && x.labels.depthBucket === '4-7',
    );
    expect(mainnet?.value).toBe(1);
    expect(unichain?.value).toBe(1);
  });

  test('dispose() unsubscribes — subsequent emits are not counted', async () => {
    const obs = createReorgObserver(bus, metrics);

    bus.emit('pool:reorg', {
      chainId: 1,
      fromBlock: 1n,
      toBlock: 0n,
      depth: 1,
    });
    obs.dispose();
    bus.emit('pool:reorg', {
      chainId: 1,
      fromBlock: 2n,
      toBlock: 0n,
      depth: 2,
    });

    const m = await metrics.reorgEventsTotal.get();
    const v = m.values.find(
      (x) => x.labels.chainId === '1' && x.labels.depthBucket === '1-3',
    );
    expect(v?.value).toBe(1);
  });

  test('depth >12 lands in the >12 bucket', async () => {
    createReorgObserver(bus, metrics);

    bus.emit('pool:reorg', {
      chainId: 8453,
      fromBlock: 100n,
      toBlock: 80n,
      depth: 20,
    });

    const m = await metrics.reorgEventsTotal.get();
    const v = m.values.find(
      (x) => x.labels.chainId === '8453' && x.labels.depthBucket === '>12',
    );
    expect(v?.value).toBe(1);
  });
});

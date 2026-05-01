import { beforeEach, describe, expect, test } from 'vitest';

import { createMetrics } from '../../src/api/metrics';
import { createEventsObserver } from '../../src/api/eventsObserver';
import { type PoolEvents, TypedEventBus } from '../../src/events/bus';

describe('createEventsObserver', () => {
  let bus: TypedEventBus<PoolEvents>;
  let metrics: ReturnType<typeof createMetrics>;

  beforeEach(() => {
    bus = new TypedEventBus<PoolEvents>();
    metrics = createMetrics();
  });

  test('Initialize event bumps eventsProcessed{eventType="Initialize"}', async () => {
    createEventsObserver(bus, metrics);
    bus.emit('pool:initialized', {
      poolId: '0xaaaa',
      chainId: 130,
      blockNumber: 1n,
    });
    const m = await metrics.eventsProcessed.get();
    const v = m.values.find(
      (x) => x.labels.chainId === '130' && x.labels.eventType === 'Initialize',
    );
    expect(v?.value).toBe(1);
  });

  test('ModifyLiquidity event bumps eventsProcessed{eventType="ModifyLiquidity"}', async () => {
    createEventsObserver(bus, metrics);
    bus.emit('pool:liquidity-changed', {
      poolId: '0xaaaa',
      chainId: 1,
      blockNumber: 1n,
      liquidityDelta: 100n,
    });
    const m = await metrics.eventsProcessed.get();
    expect(
      m.values.find(
        (x) => x.labels.chainId === '1' && x.labels.eventType === 'ModifyLiquidity',
      )?.value,
    ).toBe(1);
  });

  test('Swap event bumps eventsProcessed{eventType="Swap"}', async () => {
    createEventsObserver(bus, metrics);
    bus.emit('pool:swap', {
      poolId: '0xaaaa',
      chainId: 1,
      blockNumber: 1n,
      sqrtPriceX96: 1n,
      tick: 0,
    });
    const m = await metrics.eventsProcessed.get();
    expect(
      m.values.find((x) => x.labels.chainId === '1' && x.labels.eventType === 'Swap')
        ?.value,
    ).toBe(1);
  });

  test('Donate event bumps eventsProcessed{eventType="Donate"}', async () => {
    createEventsObserver(bus, metrics);
    bus.emit('pool:donate', {
      poolId: '0xaaaa',
      chainId: 1,
      blockNumber: 1n,
      amount0: 0n,
      amount1: 0n,
    });
    const m = await metrics.eventsProcessed.get();
    expect(
      m.values.find((x) => x.labels.chainId === '1' && x.labels.eventType === 'Donate')
        ?.value,
    ).toBe(1);
  });

  test('reorg events do NOT bump eventsProcessed (counted separately)', async () => {
    createEventsObserver(bus, metrics);
    bus.emit('pool:reorg', {
      chainId: 1,
      fromBlock: 100n,
      toBlock: 95n,
      depth: 5,
    });
    const m = await metrics.eventsProcessed.get();
    expect(m.values).toHaveLength(0);
  });

  test('dispose() unsubscribes — subsequent emits not counted', async () => {
    const obs = createEventsObserver(bus, metrics);
    bus.emit('pool:swap', {
      poolId: '0xaaaa',
      chainId: 1,
      blockNumber: 1n,
      sqrtPriceX96: 1n,
      tick: 0,
    });
    obs.dispose();
    bus.emit('pool:swap', {
      poolId: '0xaaaa',
      chainId: 1,
      blockNumber: 2n,
      sqrtPriceX96: 1n,
      tick: 0,
    });
    const m = await metrics.eventsProcessed.get();
    expect(
      m.values.find((x) => x.labels.chainId === '1' && x.labels.eventType === 'Swap')
        ?.value,
    ).toBe(1);
  });

  test('multiple chains tracked independently', async () => {
    createEventsObserver(bus, metrics);
    bus.emit('pool:swap', {
      poolId: '0xaaaa',
      chainId: 1,
      blockNumber: 1n,
      sqrtPriceX96: 1n,
      tick: 0,
    });
    bus.emit('pool:swap', {
      poolId: '0xbbbb',
      chainId: 130,
      blockNumber: 1n,
      sqrtPriceX96: 1n,
      tick: 0,
    });
    const m = await metrics.eventsProcessed.get();
    const got = new Set(
      m.values.map((v) => `${v.labels.chainId}:${v.labels.eventType}=${v.value}`),
    );
    expect(got).toEqual(new Set(['1:Swap=1', '130:Swap=1']));
  });
});

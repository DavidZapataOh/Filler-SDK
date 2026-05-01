import { describe, expect, test } from 'vitest';

import { type PoolEvents, TypedEventBus, poolEventBus } from '../src/events/bus';

describe('TypedEventBus', () => {
  test('listener receives the exact emitted payload', () => {
    const bus = new TypedEventBus<PoolEvents>();
    let captured: PoolEvents['pool:initialized'] | undefined;
    bus.on('pool:initialized', (data) => {
      captured = data;
    });

    bus.emit('pool:initialized', {
      poolId: '0xaaaa',
      chainId: 130,
      blockNumber: 42n,
    });

    expect(captured).toEqual({
      poolId: '0xaaaa',
      chainId: 130,
      blockNumber: 42n,
    });
  });

  test('off removes the listener', () => {
    const bus = new TypedEventBus<PoolEvents>();
    let calls = 0;
    const handler = () => {
      calls += 1;
    };
    bus.on('pool:swap', handler);
    bus.emit('pool:swap', {
      poolId: '0xbbbb',
      chainId: 1,
      blockNumber: 1n,
      sqrtPriceX96: 1n,
      tick: 0,
    });
    bus.off('pool:swap', handler);
    bus.emit('pool:swap', {
      poolId: '0xbbbb',
      chainId: 1,
      blockNumber: 2n,
      sqrtPriceX96: 1n,
      tick: 0,
    });
    expect(calls).toBe(1);
  });

  test('listenerCount reflects registered handlers', () => {
    const bus = new TypedEventBus<PoolEvents>();
    expect(bus.listenerCount('pool:donate')).toBe(0);
    bus.on('pool:donate', () => {});
    bus.on('pool:donate', () => {});
    expect(bus.listenerCount('pool:donate')).toBe(2);
  });

  test('singleton poolEventBus is reusable across handlers and SSE', () => {
    let count = 0;
    const handler = () => {
      count += 1;
    };
    poolEventBus.on('pool:liquidity-changed', handler);
    poolEventBus.emit('pool:liquidity-changed', {
      poolId: '0xcccc',
      chainId: 1,
      blockNumber: 1n,
      liquidityDelta: 0n,
    });
    poolEventBus.off('pool:liquidity-changed', handler);
    expect(count).toBe(1);
  });
});

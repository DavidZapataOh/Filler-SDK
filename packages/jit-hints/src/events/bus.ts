import { EventEmitter } from 'node:events';

/**
 * Event payloads the indexer emits to in-process subscribers.
 *
 * The SSE server (Plan 06) and the SDK's live-query layer (Sprint 03) both consume
 * this bus. Keep the payload shapes stable — every field is part of the API.
 */
export type PoolEvents = {
  'pool:initialized': {
    poolId: `0x${string}`;
    chainId: number;
    blockNumber: bigint;
  };
  'pool:liquidity-changed': {
    poolId: `0x${string}`;
    chainId: number;
    blockNumber: bigint;
    liquidityDelta: bigint;
  };
  'pool:swap': {
    poolId: `0x${string}`;
    chainId: number;
    blockNumber: bigint;
    sqrtPriceX96: bigint;
    tick: number;
  };
  'pool:donate': {
    poolId: `0x${string}`;
    chainId: number;
    blockNumber: bigint;
    amount0: bigint;
    amount1: bigint;
  };
};

export type PoolEventName = keyof PoolEvents;

/**
 * Strongly-typed wrapper around `EventEmitter`. Listeners get the right payload
 * shape per event name; passing the wrong shape to `emit` is a compile error.
 */
export class TypedEventBus<EventMap extends Record<string, unknown>> {
  private readonly emitter = new EventEmitter();

  constructor(maxListeners = 1_000) {
    // SSE clients each register a listener; bump the default 10-listener cap so
    // we don't spam stderr in production.
    this.emitter.setMaxListeners(maxListeners);
  }

  emit<E extends keyof EventMap & string>(
    event: E,
    data: EventMap[E],
  ): boolean {
    return this.emitter.emit(event, data);
  }

  on<E extends keyof EventMap & string>(
    event: E,
    listener: (data: EventMap[E]) => void,
  ): this {
    this.emitter.on(event, listener);
    return this;
  }

  off<E extends keyof EventMap & string>(
    event: E,
    listener: (data: EventMap[E]) => void,
  ): this {
    this.emitter.off(event, listener);
    return this;
  }

  listenerCount<E extends keyof EventMap & string>(event: E): number {
    return this.emitter.listenerCount(event);
  }
}

/**
 * Singleton instance the handlers + SSE consumers share.
 */
export const poolEventBus = new TypedEventBus<PoolEvents>();

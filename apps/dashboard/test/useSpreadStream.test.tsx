/**
 * useSpreadStream — Plan 06 typed wrapper tests.
 *
 * Locks the parser shape: invalid payloads are dropped silently rather than
 * poisoning the counter; the badge mapping covers all five hook states.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useSpreadStream } from '../src/hooks/useSpreadStream';

type Listener = (event: Event) => void;

class MockEventSource {
  url: string;
  closed = false;
  static lastInstance: MockEventSource | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.lastInstance = this;
  }

  addEventListener(event: string, listener: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const arr = this.listeners.get(event);
    if (arr !== undefined) arr.push(listener);
  }
  removeEventListener(): void {}
  close(): void {
    this.closed = true;
  }

  emitOpen(): void {
    const arr = this.listeners.get('open') ?? [];
    for (const l of [...arr]) l(new Event('open'));
  }

  emitData(name: string, data: unknown): void {
    const ev = new MessageEvent(name, { data: JSON.stringify(data) });
    for (const l of this.listeners.get(name) ?? []) l(ev);
  }

  /** Pass a raw string (not JSON-stringified) — for testing parse failure. */
  emitRaw(name: string, raw: string): void {
    const ev = new MessageEvent(name, { data: raw });
    for (const l of this.listeners.get(name) ?? []) l(ev);
  }
}

beforeEach(() => {
  MockEventSource.lastInstance = null;
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TX_HASH = `0x${'a'.repeat(64)}`;
const ORDER_HASH = `0x${'1'.repeat(64)}`;

describe('useSpreadStream', () => {
  test('appends `/events` to the emitter URL + listens for `spread-captured`', () => {
    renderHook(() => useSpreadStream('http://localhost:8080'));
    expect(MockEventSource.lastInstance?.url).toBe('http://localhost:8080/events');
  });

  test('strips trailing slash on the emitter URL', () => {
    renderHook(() => useSpreadStream('http://localhost:8080/'));
    expect(MockEventSource.lastInstance?.url).toBe('http://localhost:8080/events');
  });

  test('emitterUrl=undefined → no EventSource, badgeStatus=disconnected', () => {
    const { result } = renderHook(() => useSpreadStream(undefined));
    expect(MockEventSource.lastInstance).toBeNull();
    expect(result.current.badgeStatus).toBe('disconnected');
  });

  test('parses a valid spread-captured event end-to-end', async () => {
    const { result } = renderHook(() => useSpreadStream('http://localhost:8080'));

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      MockEventSource.lastInstance?.emitData('spread-captured', {
        txHash: TX_HASH,
        orderHash: ORDER_HASH,
        amountUSD: 250,
        totalUSD: 750,
        blockNumber: '21000123',
        timestamp: 1_700_000_000_000,
      });
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    const next = await iter.next();
    expect(next.done).toBe(false);
    expect(next.value).toMatchObject({
      txHash: TX_HASH,
      amountUSD: 250,
      totalUSD: 750,
      blockNumber: '21000123',
    });
  });

  test('drops events with malformed payload (missing totalUSD)', async () => {
    const { result } = renderHook(() => useSpreadStream('http://localhost:8080'));

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      // Missing totalUSD — should be dropped.
      MockEventSource.lastInstance?.emitData('spread-captured', {
        txHash: TX_HASH,
        orderHash: ORDER_HASH,
        amountUSD: 250,
        timestamp: 1,
      });
      // Valid event right after — should still flow.
      MockEventSource.lastInstance?.emitData('spread-captured', {
        txHash: TX_HASH,
        orderHash: ORDER_HASH,
        amountUSD: 100,
        totalUSD: 100,
        timestamp: 2,
      });
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    const next = await iter.next();
    expect(next.value).toMatchObject({ totalUSD: 100, amountUSD: 100 });
  });

  test('drops events with non-`0x` txHash', async () => {
    const { result } = renderHook(() => useSpreadStream('http://localhost:8080'));

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      MockEventSource.lastInstance?.emitData('spread-captured', {
        txHash: 'no-hex',
        orderHash: ORDER_HASH,
        amountUSD: 1,
        totalUSD: 1,
        timestamp: 1,
      });
      // Valid right after.
      MockEventSource.lastInstance?.emitData('spread-captured', {
        txHash: TX_HASH,
        orderHash: ORDER_HASH,
        amountUSD: 5,
        totalUSD: 5,
        timestamp: 2,
      });
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    expect((await iter.next()).value).toMatchObject({ amountUSD: 5 });
  });

  test('drops events with invalid JSON', async () => {
    const { result } = renderHook(() => useSpreadStream('http://localhost:8080'));

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      // Garbage payload → parser returns null → dropped.
      MockEventSource.lastInstance?.emitRaw('spread-captured', '<not json>');
      // Valid right after.
      MockEventSource.lastInstance?.emitData('spread-captured', {
        txHash: TX_HASH,
        orderHash: ORDER_HASH,
        amountUSD: 7,
        totalUSD: 7,
        timestamp: 1,
      });
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    expect((await iter.next()).value).toMatchObject({ amountUSD: 7 });
  });

  test('badgeStatus mirrors hook lifecycle', () => {
    const { result } = renderHook(() => useSpreadStream('http://localhost:8080'));
    // Initial: connecting → degraded
    expect(result.current.badgeStatus).toBe('degraded');

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
    });
    expect(result.current.badgeStatus).toBe('live');
  });
});

/**
 * useDepthStream — Plan 06 typed wrapper for the indexer depth feed.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useDepthStream } from '../src/hooks/useDepthStream';

type Listener = (event: Event) => void;

class MockEventSource {
  url: string;
  closed = false;
  static lastInstance: MockEventSource | null = null;
  static instanceCount = 0;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.lastInstance = this;
    MockEventSource.instanceCount += 1;
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
    for (const l of this.listeners.get('open') ?? []) l(new Event('open'));
  }

  emitData(name: string, data: unknown): void {
    const ev = new MessageEvent(name, { data: JSON.stringify(data) });
    for (const l of this.listeners.get(name) ?? []) l(ev);
  }
}

beforeEach(() => {
  MockEventSource.lastInstance = null;
  MockEventSource.instanceCount = 0;
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDepthStream', () => {
  test('builds the SSE URL from indexer + params', () => {
    renderHook(() =>
      useDepthStream('http://localhost:42069', {
        pool: '0xabc',
        size: 1_000_000n,
        zeroForOne: true,
      }),
    );
    const u = new URL(MockEventSource.lastInstance?.url ?? '');
    expect(u.origin + u.pathname).toBe('http://localhost:42069/depth/stream');
    expect(u.searchParams.get('pool')).toBe('0xabc');
    expect(u.searchParams.get('size')).toBe('1000000');
    expect(u.searchParams.get('zeroForOne')).toBe('true');
  });

  test('strips trailing slash on the indexer URL', () => {
    renderHook(() =>
      useDepthStream('http://localhost:42069/', {
        pool: '0xabc',
        size: 1n,
        zeroForOne: false,
      }),
    );
    const u = new URL(MockEventSource.lastInstance?.url ?? '');
    expect(u.pathname).toBe('/depth/stream');
  });

  test('indexerUrl=undefined → status=idle, no EventSource', () => {
    const { result } = renderHook(() =>
      useDepthStream(undefined, { pool: '0xabc', size: 1n, zeroForOne: true }),
    );
    expect(result.current.status).toBe('idle');
    expect(MockEventSource.lastInstance).toBeNull();
  });

  test('parses a valid depth snapshot end-to-end', async () => {
    const { result } = renderHook(() =>
      useDepthStream('http://localhost:42069', {
        pool: '0xabc',
        size: 1n,
        zeroForOne: true,
      }),
    );

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      MockEventSource.lastInstance?.emitData('depth', {
        ticks: [
          { tick: 100, liquidity: 1_000 },
          { tick: 110, liquidity: 1_500 },
        ],
        currentTick: 105,
        jitRange: { tickLower: 100, tickUpper: 110 },
      });
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    const next = await iter.next();
    expect(next.value).toMatchObject({
      currentTick: 105,
      jitRange: { tickLower: 100, tickUpper: 110 },
    });
    if (next.done !== true) {
      expect(next.value.ticks.length).toBe(2);
    }
  });

  test('drops snapshots with malformed `ticks`', async () => {
    const { result } = renderHook(() =>
      useDepthStream('http://localhost:42069', {
        pool: '0xabc',
        size: 1n,
        zeroForOne: true,
      }),
    );

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      // Bad: `ticks` is not an array → dropped.
      MockEventSource.lastInstance?.emitData('depth', {
        ticks: 'oops',
        currentTick: 1,
      });
      // Good — should flow.
      MockEventSource.lastInstance?.emitData('depth', {
        ticks: [{ tick: 1, liquidity: 1 }],
        currentTick: 1,
      });
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    const next = await iter.next();
    if (next.done !== true) {
      expect(next.value.ticks.length).toBe(1);
    }
  });

  test('does NOT reconnect when the same params object identity changes (URL is the cache key)', () => {
    // First render with one param object.
    const { rerender } = renderHook(
      ({ params }: { params: Parameters<typeof useDepthStream>[1] }) =>
        useDepthStream('http://localhost:42069', params),
      {
        initialProps: { params: { pool: '0xabc', size: 1n, zeroForOne: true } },
      },
    );
    expect(MockEventSource.instanceCount).toBe(1);

    // Same logical params but a NEW object identity.
    rerender({ params: { pool: '0xabc', size: 1n, zeroForOne: true } });
    expect(MockEventSource.instanceCount).toBe(1);

    // Real change — bumps to 2.
    rerender({ params: { pool: '0xabc', size: 2n, zeroForOne: true } });
    expect(MockEventSource.instanceCount).toBe(2);
  });
});

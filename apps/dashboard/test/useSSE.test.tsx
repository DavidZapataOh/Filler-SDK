/**
 * useSSE — Plan 06 hook tests.
 *
 * MockEventSource lets us drive `open` / `<eventName>` / `error` events
 * deterministically + read the `closed` flag for cleanup checks.
 *
 * Critical assertions:
 *   - The returned `events` AsyncIterable identity is STABLE across
 *     re-renders. Without this, consumer `useEffect [source]` thrashes
 *     and the demo would reconnect-loop in production. (F-51 lock.)
 *   - Connection lifecycle: connecting → live → reconnecting → live.
 *   - Cleanup on unmount closes EventSource + resolves pending iterators.
 *   - Bounded queue: exceeding the cap drops oldest, not newest.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useSSE } from '../src/hooks/useSSE';

// === MockEventSource ======================================================

type Listener = (event: Event) => void;

class MockEventSource {
  public url: string;
  public readyState = 0; // CONNECTING
  public closed = false;
  private listeners = new Map<string, Listener[]>();

  static lastInstance: MockEventSource | null = null;
  static instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource.lastInstance = this;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, listener: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const arr = this.listeners.get(event);
    if (arr !== undefined) arr.push(listener);
  }

  removeEventListener(event: string, listener: Listener): void {
    const arr = this.listeners.get(event);
    if (arr === undefined) return;
    const idx = arr.indexOf(listener);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** Test helper — fire an `open` event and bump readyState. */
  emitOpen(): void {
    this.readyState = 1;
    this.fire('open', new Event('open'));
  }

  /** Test helper — fire a typed event with JSON-stringified data. */
  emitEvent(name: string, data: unknown): void {
    const ev = new MessageEvent(name, { data: JSON.stringify(data) });
    this.fire(name, ev);
  }

  /** Test helper — fire an `error` event. */
  emitError(): void {
    this.fire('error', new Event('error'));
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  private fire(event: string, e: Event): void {
    const arr = this.listeners.get(event) ?? [];
    for (const l of [...arr]) l(e);
  }
}

beforeEach(() => {
  MockEventSource.lastInstance = null;
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// === Stable iterable identity (F-51 lock) =================================

describe('useSSE — stable iterable identity (F-51)', () => {
  test('events reference is stable across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ url }: { url: string | undefined }) => useSSE<{ x: number }>(url, { eventName: 'evt' }),
      { initialProps: { url: 'http://test.local/events' } },
    );
    const first = result.current.events;
    rerender({ url: 'http://test.local/events' });
    rerender({ url: 'http://test.local/events' });
    expect(result.current.events).toBe(first);
  });

  test('events reference stays the same even when status changes', () => {
    const { result } = renderHook(() =>
      useSSE<{ x: number }>('http://test.local/events', { eventName: 'evt' }),
    );
    const first = result.current.events;
    act(() => {
      MockEventSource.lastInstance?.emitOpen();
    });
    expect(result.current.status).toBe('live');
    expect(result.current.events).toBe(first);
  });
});

// === Lifecycle ============================================================

describe('useSSE — lifecycle', () => {
  test('starts in `connecting` then transitions to `live` on open', () => {
    const { result } = renderHook(() =>
      useSSE<{ x: number }>('http://test.local/events', { eventName: 'evt' }),
    );
    expect(result.current.status).toBe('connecting');
    act(() => {
      MockEventSource.lastInstance?.emitOpen();
    });
    expect(result.current.status).toBe('live');
  });

  test('url=undefined → status=idle, no EventSource constructed', () => {
    const { result } = renderHook(() => useSSE<{ x: number }>(undefined));
    expect(result.current.status).toBe('idle');
    expect(MockEventSource.lastInstance).toBeNull();
  });

  test('cleanup on unmount closes the EventSource', () => {
    const { unmount } = renderHook(() =>
      useSSE<{ x: number }>('http://test.local/events', { eventName: 'evt' }),
    );
    const es = MockEventSource.lastInstance;
    expect(es).not.toBeNull();
    expect(es?.closed).toBe(false);
    unmount();
    expect(es?.closed).toBe(true);
  });
});

// === Event delivery =======================================================

describe('useSSE — event delivery', () => {
  test('parsed events flow through the iterator in order', async () => {
    const { result } = renderHook(() =>
      useSSE<{ x: number }>('http://test.local/events', { eventName: 'evt' }),
    );
    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      MockEventSource.lastInstance?.emitEvent('evt', { x: 1 });
      MockEventSource.lastInstance?.emitEvent('evt', { x: 2 });
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    expect((await iter.next()).value).toEqual({ x: 1 });
    expect((await iter.next()).value).toEqual({ x: 2 });
  });

  test('skips events that fail the optional `parse` validator', async () => {
    const { result } = renderHook(() =>
      useSSE<{ x: number }>('http://test.local/events', {
        eventName: 'evt',
        parse: (raw): { x: number } | null => {
          try {
            const v = JSON.parse(raw);
            return typeof v?.x === 'number' ? v : null;
          } catch {
            return null;
          }
        },
      }),
    );

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      MockEventSource.lastInstance?.emitEvent('evt', { x: 1 });
      // Event with no `x` field — parser returns null → skipped.
      MockEventSource.lastInstance?.emitEvent('evt', { y: 'wat' });
      MockEventSource.lastInstance?.emitEvent('evt', { x: 2 });
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    expect((await iter.next()).value).toEqual({ x: 1 });
    expect((await iter.next()).value).toEqual({ x: 2 });
  });
});

// === Reconnect ============================================================

describe('useSSE — reconnect on error', () => {
  test('error transitions to `reconnecting` + bumps reconnectAttempt', () => {
    const { result } = renderHook(() =>
      useSSE<{ x: number }>('http://test.local/events', {
        eventName: 'evt',
        reconnectBaseMs: 100,
      }),
    );

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
    });
    expect(result.current.status).toBe('live');

    act(() => {
      MockEventSource.lastInstance?.emitError();
    });
    expect(result.current.status).toBe('reconnecting');
    expect(result.current.reconnectAttempt).toBe(1);
  });

  test('reconnect creates a fresh EventSource after backoff timer fires', () => {
    renderHook(() =>
      useSSE<{ x: number }>('http://test.local/events', {
        eventName: 'evt',
        reconnectBaseMs: 1_000,
        reconnectCapMs: 1_000, // pin cap so we don't get jitter past 1s+25%
      }),
    );

    const first = MockEventSource.lastInstance;
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => {
      first?.emitOpen();
      first?.emitError();
    });

    // Backoff first attempt: ~1000ms ± 25% jitter. 2000ms is safe.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2);
    expect(MockEventSource.lastInstance).not.toBe(first);
  });

  test('gives up after maxReconnectAttempts → status=disconnected', () => {
    const { result } = renderHook(() =>
      useSSE<{ x: number }>('http://test.local/events', {
        eventName: 'evt',
        reconnectBaseMs: 100,
        reconnectCapMs: 200,
        maxReconnectAttempts: 2,
      }),
    );

    // First failure → reconnect 1
    act(() => {
      MockEventSource.lastInstance?.emitError();
    });
    expect(result.current.reconnectAttempt).toBe(1);
    expect(result.current.status).toBe('reconnecting');

    // Backoff fires, new ES, second failure → reconnect 2
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      MockEventSource.lastInstance?.emitError();
    });
    expect(result.current.reconnectAttempt).toBe(2);

    // Backoff fires, new ES, third failure → at the cap → disconnected
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      MockEventSource.lastInstance?.emitError();
    });
    expect(result.current.status).toBe('disconnected');
  });
});

// === Bounded queue ========================================================

describe('useSSE — bounded queue', () => {
  test('drops oldest when exceeding maxBuffered', async () => {
    const { result } = renderHook(() =>
      useSSE<{ n: number }>('http://test.local/events', {
        eventName: 'evt',
        maxBuffered: 3,
      }),
    );

    act(() => {
      MockEventSource.lastInstance?.emitOpen();
      // Push 5 events into a 3-event buffer → oldest 2 dropped.
      for (let n = 1; n <= 5; n++) {
        MockEventSource.lastInstance?.emitEvent('evt', { n });
      }
    });

    const iter = result.current.events[Symbol.asyncIterator]();
    expect((await iter.next()).value).toEqual({ n: 3 });
    expect((await iter.next()).value).toEqual({ n: 4 });
    expect((await iter.next()).value).toEqual({ n: 5 });
  });
});

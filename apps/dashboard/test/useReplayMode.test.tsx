/**
 * useReplayMode — Plan 07 deterministic replay tests.
 *
 * `?replay=...` URL param: drives fixture lookup. Without it, enabled=false.
 *
 * Determinism: the iterators yield events at exact `atMs` offsets via
 * `setTimeout`. With `vi.useFakeTimers()` we can step the timeline + assert
 * each event lands at the right wall-clock — same fixture → same sequence.
 *
 * Critical assertions:
 *   - Stable iterable identity across renders (F-51 lock).
 *   - `?replay=treasury` resolves to the treasury fixture.
 *   - Unknown / missing replay key → enabled=false.
 *   - Spread events fire at fixture.atMs offsets.
 *   - threeFilesStep ticks at fixture marker times.
 *   - Same fixture → same event sequence (determinism check).
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { treasuryFixture } from '../src/fixtures/treasury';
import { useReplayMode } from '../src/hooks/useReplayMode';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  // Reset URL between tests so the fixture-key resolution doesn't leak.
  window.history.pushState({}, '', '/');
});

function pushReplay(key: string): void {
  window.history.pushState({}, '', `/?replay=${key}`);
}

// === Mode resolution ======================================================

describe('useReplayMode — mode resolution', () => {
  test('no `?replay=` param → enabled=false, fixture=null', () => {
    const { result } = renderHook(() => useReplayMode());
    expect(result.current.enabled).toBe(false);
    expect(result.current.fixture).toBeNull();
  });

  test('`?replay=treasury` resolves to the treasury fixture', () => {
    pushReplay('treasury');
    const { result } = renderHook(() => useReplayMode());
    expect(result.current.enabled).toBe(true);
    expect(result.current.fixture?.vertical).toBe('treasury-rebalance');
    expect(result.current.fixture?.name).toBe('Treasury rebalance');
  });

  test('`?replay=lvr` resolves to the lvr fixture', () => {
    pushReplay('lvr');
    const { result } = renderHook(() => useReplayMode());
    expect(result.current.fixture?.vertical).toBe('lvr-aware');
  });

  test('`?replay=simple` resolves to the simple fixture', () => {
    pushReplay('simple');
    const { result } = renderHook(() => useReplayMode());
    expect(result.current.fixture?.vertical).toBe('simple-jit');
  });

  test('unknown replay key → enabled=false', () => {
    pushReplay('mystery');
    const { result } = renderHook(() => useReplayMode());
    expect(result.current.enabled).toBe(false);
  });
});

// === Stable iterable identity (F-51 lock) ================================

describe('useReplayMode — stable iterable identity', () => {
  test('spreadSource + depthSource references stable across re-renders', () => {
    pushReplay('treasury');
    const { result, rerender } = renderHook(() => useReplayMode());
    const firstSpread = result.current.spreadSource;
    const firstDepth = result.current.depthSource;
    rerender();
    rerender();
    expect(result.current.spreadSource).toBe(firstSpread);
    expect(result.current.depthSource).toBe(firstDepth);
  });

  test('disabled mode returns stable empty iterables', () => {
    const { result, rerender } = renderHook(() => useReplayMode());
    const firstSpread = result.current.spreadSource;
    rerender();
    expect(result.current.spreadSource).toBe(firstSpread);
  });
});

// === Replay timeline determinism =========================================

describe('useReplayMode — replay determinism', () => {
  test('spread events emit at the fixture atMs offsets', async () => {
    pushReplay('treasury');
    const { result } = renderHook(() => useReplayMode());
    const iter = result.current.spreadSource[Symbol.asyncIterator]();

    // First call — anchors the start clock + sets a setTimeout for atMs=5000.
    const firstPromise = iter.next();

    // Before the timer fires, the promise is still pending.
    let resolvedAt5s: IteratorResult<unknown> | undefined;
    void firstPromise.then((v) => {
      resolvedAt5s = v;
    });
    await act(async () => {
      vi.advanceTimersByTime(4_999);
    });
    expect(resolvedAt5s).toBeUndefined();

    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    const first = await firstPromise;
    expect(first.done).toBe(false);
    if (first.done !== true) {
      expect(first.value.totalUSD).toBe(312); // first fixture totalUSD
      expect(first.value.amountUSD).toBe(312);
      expect(first.value.txHash.startsWith('0xa')).toBe(true);
    }

    // Next event lands at atMs=12000 → 7000ms after the first.
    const secondPromise = iter.next();
    await act(async () => {
      vi.advanceTimersByTime(7_000);
    });
    const second = await secondPromise;
    if (second.done !== true) {
      expect(second.value.totalUSD).toBe(799); // pre-computed cumulative
      expect(second.value.amountUSD).toBe(487);
    }
  });

  test('same fixture → same event sequence (deterministic across mounts)', async () => {
    pushReplay('treasury');

    async function collectFirstThree(): Promise<number[]> {
      const { result, unmount } = renderHook(() => useReplayMode());
      const iter = result.current.spreadSource[Symbol.asyncIterator]();

      const totals: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const p = iter.next();
        // Drive enough wall-clock to cover the next event.
        await act(async () => {
          vi.advanceTimersByTime(35_000);
        });
        const r = await p;
        if (r.done !== true) {
          totals.push(r.value.totalUSD);
        }
      }
      unmount();
      return totals;
    }

    const run1 = await collectFirstThree();
    const run2 = await collectFirstThree();
    expect(run1).toEqual(run2);
    expect(run1).toEqual([312, 799, 1_823]);
  });

  test('timestamp comes from fixture (NOT Date.now wall-clock)', async () => {
    pushReplay('treasury');
    const { result } = renderHook(() => useReplayMode());
    const iter = result.current.spreadSource[Symbol.asyncIterator]();
    const p = iter.next();
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    const first = await p;
    if (first.done !== true) {
      const fixtureTs = treasuryFixture.spreadEvents[0]?.timestampMs;
      expect(first.value.timestamp).toBe(fixtureTs);
    }
  });

  test('iterator is exhausted after the fixture ends', async () => {
    pushReplay('treasury');
    const { result } = renderHook(() => useReplayMode());
    const iter = result.current.spreadSource[Symbol.asyncIterator]();

    // Drain all events.
    for (let i = 0; i < treasuryFixture.spreadEvents.length; i += 1) {
      const p = iter.next();
      await act(async () => {
        vi.advanceTimersByTime(90_000);
      });
      await p;
    }
    // Next call returns done=true.
    const ended = await iter.next();
    expect(ended.done).toBe(true);
  });
});

// === ThreeFilesStep driver ===============================================

describe('useReplayMode — threeFilesStep timeline', () => {
  test('starts at 0', () => {
    pushReplay('treasury');
    const { result } = renderHook(() => useReplayMode());
    expect(result.current.threeFilesStep).toBe(0);
  });

  test('ticks ahead at each fixture marker time', async () => {
    pushReplay('treasury');
    const { result } = renderHook(() => useReplayMode());
    expect(result.current.threeFilesStep).toBe(0);

    // First marker at atMs=75500.
    await act(async () => {
      vi.advanceTimersByTime(75_500);
    });
    expect(result.current.threeFilesStep).toBe(1);

    // Subsequent at 76300, 77100, 77900.
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.threeFilesStep).toBe(2);

    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.threeFilesStep).toBe(3);

    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.threeFilesStep).toBe(4);
  });

  test('disabled mode never advances threeFilesStep', async () => {
    const { result } = renderHook(() => useReplayMode());
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current.threeFilesStep).toBe(0);
  });
});

// === Empty iterables in disabled mode ====================================

describe('useReplayMode — disabled mode iterables', () => {
  test('spread + depth iterables resolve immediately to done', async () => {
    const { result } = renderHook(() => useReplayMode());
    const spreadNext = result.current.spreadSource[Symbol.asyncIterator]().next();
    const depthNext = result.current.depthSource[Symbol.asyncIterator]().next();
    expect((await spreadNext).done).toBe(true);
    expect((await depthNext).done).toBe(true);
  });
});

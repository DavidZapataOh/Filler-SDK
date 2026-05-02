/**
 * useReplayMode — read `?replay=<key>` from the URL once on mount, return
 * deterministic replay sources that the App swaps in for the live SSE
 * hooks.
 *
 *   ?replay=treasury → treasury rebalance fixture
 *   ?replay=lvr      → LVR-aware fixture
 *   ?replay=simple   → simple JIT fixture
 *   (anything else)  → enabled=false, App falls back to live SSE
 *
 * Why replay mode exists: the demo recording (Plan 08) + judges browsing
 * the deployed page need a deterministic visual that NEVER fails on
 * camera. SSE / indexer / solver outages would tank the recording.
 *
 * Determinism guarantees:
 *
 *   - Source identity is STABLE across renders (`useMemo([])` + closure
 *     capture of the `started` flag) — same as Plan 06's F-51 lock.
 *
 *   - Event timestamps come from the FIXTURE, not wall-clock. Replay
 *     yields the same `timestampMs` every run; SpreadCounter's `totalUSD`
 *     also comes from the fixture (pre-computed at authoring time, F-45
 *     reconnect-safety preserved offline).
 *
 *   - Timing uses `setTimeout(_, atMs - elapsedFromStart)` with a SINGLE
 *     start anchor captured when the iterator is first consumed.
 *     `performance.now()` is NOT used — under fake timers the two clocks
 *     drift; under real timers backgrounded tabs throttle setTimeout
 *     differently than performance.now. Setting timeouts at exact ms
 *     offsets is the deterministic primitive.
 *
 * One-shot semantics (no looping):
 *
 *   The fixture's events fire ONCE; after the last event the iterator
 *   returns `{done: true}`. We deliberately don't loop — looping would
 *   either:
 *     (a) reset `totalUSD` to small numbers → counter visibly DECREASES
 *     (bad UX), or
 *     (b) bump `totalUSD` across loops (monotonic but breaks
 *     reconnect-safety semantics).
 *   Demos are recorded at fixed length; looping is not needed for v0.
 */

import { useEffect, useMemo, useState } from 'react';

import type { DepthSnapshot } from '../components/JITDepthChart';
import type { SpreadEvent } from '../components/SpreadCounter';
import { FIXTURES, type Fixture, type FixtureKey, isFixtureKey } from '../fixtures';

export interface UseReplayModeResult {
  enabled: boolean;
  fixture: Fixture | null;
  /** Stable `AsyncIterable<SpreadEvent>` for SpreadCounter — replays the fixture once. */
  spreadSource: AsyncIterable<SpreadEvent>;
  /** Stable `AsyncIterable<DepthSnapshot>` for JITDepthChart. */
  depthSource: AsyncIterable<DepthSnapshot>;
  /** Current ThreeFilesReveal step (0..4); ticks via setTimeout markers. */
  threeFilesStep: number;
}

/** Resolve the requested fixture from the URL once. */
function resolveFixtureKey(): FixtureKey | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('replay');
  if (raw === null) return null;
  return isFixtureKey(raw) ? raw : null;
}

const EMPTY_ITERABLE: AsyncIterable<never> = {
  [Symbol.asyncIterator]() {
    return {
      next: () => Promise.resolve({ value: undefined as never, done: true }),
    };
  },
};

export function useReplayMode(): UseReplayModeResult {
  // Read once at mount. URL changes between mounts re-fire (key-based
  // remount handled by the parent if it cares).
  const fixtureKey = useMemo(() => resolveFixtureKey(), []);
  const fixture = fixtureKey === null ? null : FIXTURES[fixtureKey];

  // Stable iterables (F-51 lock pattern from Plan 06's useSSE):
  // useMemo([]) means one identity for the hook's lifetime. The closure
  // captures `fixture` — fixture itself is stable because FIXTURES is a
  // top-level constant.
  const spreadSource = useMemo<AsyncIterable<SpreadEvent>>(
    () => (fixture === null ? EMPTY_ITERABLE : makeSpreadIterable(fixture)),
    // Deliberately depend ONLY on `fixture` identity — which is stable
    // because FIXTURES is a const-frozen registry.
    [fixture],
  );
  const depthSource = useMemo<AsyncIterable<DepthSnapshot>>(
    () => (fixture === null ? EMPTY_ITERABLE : makeDepthIterable(fixture)),
    [fixture],
  );

  // ThreeFilesStep driver — schedules a setTimeout per marker. State
  // ticks ahead each marker fires; replay is deterministic because the
  // markers are baked into the fixture.
  const [threeFilesStep, setThreeFilesStep] = useState(0);
  useEffect(() => {
    if (fixture === null) return undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const marker of fixture.threeFilesReveal) {
      const t = setTimeout(() => {
        setThreeFilesStep(marker.step);
      }, marker.atMs);
      timers.push(t);
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [fixture]);

  return {
    enabled: fixture !== null,
    fixture,
    spreadSource,
    depthSource,
    threeFilesStep,
  };
}

// === Iterable factories ==================================================

function makeSpreadIterable(fixture: Fixture): AsyncIterable<SpreadEvent> {
  return {
    [Symbol.asyncIterator]() {
      // Capture start anchor on first .next() — keeps iterator-construction
      // (during render via useMemo) decoupled from "replay clock starts."
      let start: number | null = null;
      let i = 0;
      return {
        next(): Promise<IteratorResult<SpreadEvent>> {
          if (start === null) start = Date.now();
          if (i >= fixture.spreadEvents.length) {
            return Promise.resolve({ value: undefined as never, done: true });
          }
          const event = fixture.spreadEvents[i];
          i += 1;
          if (event === undefined) {
            return Promise.resolve({ value: undefined as never, done: true });
          }
          const elapsed = Date.now() - start;
          const wait = Math.max(0, event.atMs - elapsed);
          const result: SpreadEvent = {
            totalUSD: event.totalUSD,
            amountUSD: event.amountUSD,
            txHash: event.txHash,
            orderHash: event.orderHash,
            blockNumber: event.blockNumber,
            timestamp: event.timestampMs,
          };
          return new Promise((resolve) => {
            setTimeout(() => resolve({ value: result, done: false }), wait);
          });
        },
      };
    },
  };
}

function makeDepthIterable(fixture: Fixture): AsyncIterable<DepthSnapshot> {
  return {
    [Symbol.asyncIterator]() {
      let start: number | null = null;
      let i = 0;
      return {
        next(): Promise<IteratorResult<DepthSnapshot>> {
          if (start === null) start = Date.now();
          if (i >= fixture.depthSnapshots.length) {
            return Promise.resolve({ value: undefined as never, done: true });
          }
          const snap = fixture.depthSnapshots[i];
          i += 1;
          if (snap === undefined) {
            return Promise.resolve({ value: undefined as never, done: true });
          }
          const elapsed = Date.now() - start;
          const wait = Math.max(0, snap.atMs - elapsed);
          const result: DepthSnapshot = {
            ticks: snap.ticks,
            currentTick: snap.currentTick,
          };
          if (snap.jitRange !== undefined) {
            result.jitRange = snap.jitRange;
          }
          return new Promise((resolve) => {
            setTimeout(() => resolve({ value: result, done: false }), wait);
          });
        },
      };
    },
  };
}

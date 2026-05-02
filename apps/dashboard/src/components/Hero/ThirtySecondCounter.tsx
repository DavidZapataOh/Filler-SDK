/**
 * ThirtySecondCounter — the AFTER side's visualisation.
 *
 * Three phases:
 *   1. Tick — 0s → 30s, displayed as `00s` (mono, tabular-nums).
 *      Simulated at 30 ticks × 100 ms = 3 s real time. The label CLAIMS
 *      30 seconds (which is true for production); the simulation tempo is
 *      a demo concession noted in this file's JSDoc.
 *   2. Done — "DONE ✓" badge, count animates from $0 to TARGET_USD over
 *      ~800 ms with a cubic ease-out.
 *   3. Idle — the final state shows the captured amount; replay-mode
 *      (Sprint 05 Plan 07) calls `restart()` via the imperative ref.
 *
 * Design system applied:
 *   - The TIME number uses cyan-400 (`--color-live`). Cyan is the dashboard's
 *     status / data-flowing color; an active timer is exactly that.
 *   - The MONEY number uses emerald-400 (`--color-money`). Emerald is the
 *     dashboard's ONE money color. Plan 02 of the markdown sketched this as
 *     cyan — that would have collided with the timer + diluted the accent.
 *   - The progress bar uses an emerald gradient — same money color, just
 *     in fill form. The bar literally fills with money as the trade
 *     progresses; the metaphor is intentional.
 *   - "DONE ✓" uses emerald (positive completion) — same family as money.
 *   - Number labels (s, USD, "captured", "first fill in this demo") are
 *     muted gray. design.txt: "below the name of the file we have the
 *     size and type of file. This isn't super important information."
 *
 * Accessibility:
 *   - Timer + amount are wrapped in <output aria-live="polite"> so SR
 *     readers announce phase changes without interrupting other reading.
 *   - When `prefers-reduced-motion: reduce` is set, we still run the timer
 *     but the count-up is collapsed to immediate (no ramp). The timer is
 *     informational, not decorative.
 */

import clsx from 'clsx';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

const TARGET_USD = 1_247;
const TICK_MS = 100; // 30 ticks → 3 s simulated wall-clock
const TOTAL_TICKS = 30;
const COUNTUP_MS = 800;

export interface ThirtySecondCounterHandle {
  restart(): void;
}

interface ThirtySecondCounterProps {
  /**
   * Auto-start on mount. Default true. Tests + replay-mode pass `false`
   * and call `restart()` via ref to control timing precisely.
   */
  autoStart?: boolean;
  className?: string;
}

export const ThirtySecondCounter = forwardRef<ThirtySecondCounterHandle, ThirtySecondCounterProps>(
  function ThirtySecondCounter({ autoStart = true, className }, handleRef) {
    const [seconds, setSeconds] = useState(0);
    const [phase, setPhase] = useState<'idle' | 'ticking' | 'done'>(autoStart ? 'ticking' : 'idle');
    const [usd, setUsd] = useState(0);

    const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const countupTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopAllTimers = useCallback((): void => {
      if (tickTimer.current !== null) {
        clearInterval(tickTimer.current);
        tickTimer.current = null;
      }
      if (countupTimer.current !== null) {
        clearInterval(countupTimer.current);
        countupTimer.current = null;
      }
    }, []);

    const restart = useCallback((): void => {
      stopAllTimers();
      setSeconds(0);
      setUsd(0);
      setPhase('ticking');
    }, [stopAllTimers]);

    useImperativeHandle(handleRef, () => ({ restart }), [restart]);

    // Phase 1 — tick from 0 → 30.
    useEffect(() => {
      if (phase !== 'ticking') return;

      tickTimer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= TOTAL_TICKS) {
            setPhase('done');
            return TOTAL_TICKS;
          }
          return s + 1;
        });
      }, TICK_MS);

      return () => {
        stopAllTimers();
      };
    }, [phase, stopAllTimers]);

    // Phase 2 — count up $0 → TARGET_USD. Cubic ease-out (`1 - (1-t)^3`).
    useEffect(() => {
      if (phase !== 'done') return;

      const start = Date.now();
      countupTimer.current = setInterval(() => {
        const t = Math.min(1, (Date.now() - start) / COUNTUP_MS);
        const eased = 1 - (1 - t) ** 3;
        setUsd(Math.floor(TARGET_USD * eased));
        if (t === 1) {
          if (countupTimer.current !== null) {
            clearInterval(countupTimer.current);
            countupTimer.current = null;
          }
        }
      }, 16);

      return () => {
        if (countupTimer.current !== null) {
          clearInterval(countupTimer.current);
          countupTimer.current = null;
        }
      };
    }, [phase]);

    const progressPct = (seconds / TOTAL_TICKS) * 100;
    const isDone = phase === 'done';

    return (
      <div className={clsx('flex flex-col gap-5', className)}>
        <div className="flex items-center gap-4">
          <output
            aria-live="polite"
            aria-label={`${seconds} of 30 seconds elapsed`}
            // Cyan = "data flowing / live status" per Plan 01 design system.
            // Mono + tabular-nums prevents jiggle as digits change.
            className="w-20 font-mono text-3xl font-semibold tabular-nums text-[--color-live]"
          >
            {String(seconds).padStart(2, '0')}s
          </output>

          <div
            className="relative h-2 flex-1 overflow-hidden rounded-full bg-[--color-surface-3]"
            aria-hidden="true"
          >
            <div
              // Progress bar fills with the money color — visual metaphor
              // is "the trade fills with money as it progresses."
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[--color-money-strong] to-[--color-money] transition-[width] duration-100 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {isDone && (
            // Single accent: emerald = positive completion. Cyan would
            // compete with the timer above + dilute the design system.
            <span className="motion-safe:animate-[slide-up_280ms_cubic-bezier(0.22,1,0.36,1)] inline-flex items-center gap-1 rounded-full border border-[--color-money-faint] bg-[--color-money-faint]/30 px-2.5 py-0.5 text-xs font-semibold text-[--color-money]">
              <span aria-hidden="true">✓</span>
              <span>Done</span>
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <output
            aria-live="polite"
            aria-label={`${usd} US dollars captured in this demo`}
            className={clsx(
              'flex items-baseline gap-2 font-mono tabular-nums transition-opacity',
              isDone ? 'opacity-100' : 'opacity-40',
            )}
          >
            <span className="text-2xl font-semibold text-[--color-text-subtle]">$</span>
            <span
              // Big captured number = emerald (money color). NOT cyan.
              className="text-5xl font-bold leading-none tracking-tight text-[--color-money]"
              data-testid="hero-30s-amount"
            >
              {usd.toLocaleString('en-US')}
            </span>
            <span className="text-sm font-medium text-[--color-text-muted]">captured</span>
          </output>

          {/* Honest framing: $1,247 is a representative amount, not a measured
            historical fact. Labelling it as "first fill in this demo" tells
            the viewer "this is illustrative" without breaking the narrative. */}
          <span className="text-xs text-[--color-text-faint]">
            First fill in this demo · representative amount
          </span>
        </div>
      </div>
    );
  },
);

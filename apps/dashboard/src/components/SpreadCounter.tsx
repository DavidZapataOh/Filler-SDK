/**
 * SpreadCounter — the demo's money shot.
 *
 * Live version of HeroCounter. Subscribes to an AsyncIterable<SpreadEvent>
 * (Plan 06's `useSSE` hook produces one); renders the cumulative spread
 * captured as a count-up animated big number; flashes an emerald glow on
 * each update; shows the most recent fill below (tx hash + per-fill amount,
 * linked to the chain explorer).
 *
 * Why AsyncIterable as the contract:
 *   The component shouldn't know whether events come from a live SSE
 *   stream, a replay-mode fixture, or a vitest mock generator. Async
 *   iterables compose cleanly across all three.
 *
 * Server-authoritative `totalUSD` (NOT client-side sum):
 *   Plan 03's markdown sketches `setTotal((t) => t + event.amountUSD)`.
 *   That's a real bug — if SSE reconnects mid-session, the server's first
 *   replayed event's `amountUSD` would be added on top of the already-summed
 *   total, double-counting. The treasury-rebalance dashboard emitter
 *   (Sprint 04 P05) sends `totalUSD` as the SERVER-CUMULATIVE figure +
 *   `amountUSD` as the per-fill delta. We use `totalUSD` as the source of
 *   truth + `amountUSD` only for the per-fill display below. (Logged as F-45.)
 *
 * Design system:
 *   - Big Number = pure white (`--color-text-primary`). The page's reserved
 *     pure-white element. Same as Plan 01's HeroCounter — visual rhyme.
 *   - Halo + glow + per-fill delta = emerald (`--color-money`). NOT cyan.
 *     Plan 03 markdown sketched cyan everywhere; Plan 01's design system
 *     reserves emerald for money. (Plans-doc drift logged in F-42 / F-43.)
 *   - Tx hash + last-fill chrome = muted gray. Labels aren't data.
 *   - Glow is a transient ring + box-shadow, not a background tint —
 *     design.txt: "borders > extra background layers."
 */

import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CountUp } from './CountUp';

export interface SpreadEvent {
  /** Server-cumulative spread captured since session start, in USD. */
  totalUSD: number;
  /** This fill's spread captured, in USD. */
  amountUSD: number;
  /** Transaction hash. */
  txHash: `0x${string}`;
  /** UniswapX order hash. */
  orderHash: `0x${string}`;
  /** Block number the fill landed in. */
  blockNumber?: string;
  /** UNIX timestamp (ms). */
  timestamp: number;
}

interface SpreadCounterProps {
  /**
   * Async source of spread events. Plan 06's `useSSE` hook will return one;
   * tests pass a mock async generator; replay-mode (Plan 07) ships a
   * deterministic finite source. When undefined, the component renders the
   * empty / connecting state.
   */
  source?: AsyncIterable<SpreadEvent> | undefined;
  /**
   * Base URL for the chain explorer. Tx hash links append `/<txHash>`.
   * Default: Unichain explorer. Override per chain (mainnet → etherscan,
   * Base → basescan, etc).
   */
  explorerBaseUrl?: string;
  className?: string;
}

const DEFAULT_EXPLORER = 'https://uniscan.xyz/tx';
/** Glow stays on for this long after the latest event before fading out. */
const GLOW_HOLD_MS = 720;
/** Currency formatter for the per-fill delta — 2 decimals, en-US locale. */
const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function SpreadCounter({
  source,
  explorerBaseUrl = DEFAULT_EXPLORER,
  className,
}: SpreadCounterProps): JSX.Element {
  const [total, setTotal] = useState(0);
  const [lastFill, setLastFill] = useState<SpreadEvent | null>(null);
  const [glow, setGlow] = useState(false);
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe whenever the `source` reference changes. Using AsyncIterable
  // means the component itself is transport-agnostic.
  useEffect(() => {
    if (source === undefined) return;

    let cancelled = false;
    void (async () => {
      try {
        for await (const event of source) {
          if (cancelled) break;
          // Server is authoritative on cumulative — guards against double-
          // counting on SSE reconnect. (See top-of-file note + F-45.)
          setTotal(event.totalUSD);
          setLastFill(event);
          setGlow(true);
          if (glowTimer.current !== null) clearTimeout(glowTimer.current);
          glowTimer.current = setTimeout(() => setGlow(false), GLOW_HOLD_MS);
        }
      } catch {
        // Source threw — surface visually by clearing glow. The Plan 06
        // SSE hook handles reconnect; we don't crash the UI on a transient
        // failure.
        setGlow(false);
      }
    })();

    return () => {
      cancelled = true;
      if (glowTimer.current !== null) {
        clearTimeout(glowTimer.current);
        glowTimer.current = null;
      }
    };
  }, [source]);

  return (
    <div
      data-testid="spread-counter"
      data-glow={glow ? 'on' : 'off'}
      className={clsx(
        'relative flex flex-col gap-6 rounded-2xl border bg-[--color-surface-1] p-6 transition-[box-shadow,border-color] duration-500 sm:p-8',
        // Border baseline always present so the glow doesn't cause layout
        // shift (border-width transitions cause CLS jitter; we only
        // change the COLOR + box-shadow).
        glow
          ? 'border-[--color-money]/60 shadow-[0_0_36px_-4px_var(--color-money-faint)]'
          : 'border-[--color-border-subtle] shadow-none',
        className,
      )}
    >
      {/* Faint emerald halo behind the number — same primitive as
          HeroCounter so the visual rhymes when both are on the page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1/4 top-1/3 -z-10 h-32 -translate-y-1/2 rounded-full bg-[--color-money-faint] opacity-25 blur-3xl"
      />

      <BigNumber total={total} />

      {/* Last-fill row. When no fill has landed yet, render a placeholder
          row with the same height so the card doesn't shift on first event
          (CLS budget). */}
      <LastFillRow fill={lastFill} explorerBaseUrl={explorerBaseUrl} />
    </div>
  );
}

// === Big Number ===========================================================

interface BigNumberProps {
  total: number;
}

function BigNumber({ total }: BigNumberProps): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[--color-text-muted]">
        Spread captured
      </p>
      <output
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${total.toFixed(2)} US dollars captured`}
        className="flex items-baseline gap-1.5 font-mono"
      >
        <span className="text-3xl font-semibold text-[--color-text-subtle]">$</span>
        <span
          // The page's reserved pure-white element. Same token as
          // HeroCounter's Big Number — visual rhyme.
          className="text-7xl font-bold tracking-tight tabular-nums text-[--color-text-primary] sm:text-8xl"
          data-testid="spread-counter-amount"
        >
          <CountUp end={Math.floor(total)} />
        </span>
        <span className="text-base font-medium text-[--color-text-muted]">USD</span>
      </output>
      <p className="max-w-md text-sm text-[--color-text-muted]">
        Internalised by self-filling DAOs since session start. Every fill keeps spread inside the
        treasury that submitted the intent.
      </p>
    </div>
  );
}

// === Last fill row ========================================================

interface LastFillRowProps {
  fill: SpreadEvent | null;
  explorerBaseUrl: string;
}

function LastFillRow({ fill, explorerBaseUrl }: LastFillRowProps): JSX.Element {
  return (
    <div className="border-t border-[--color-border-subtle] pt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-[--color-text-subtle]">
        Last fill
      </p>
      {fill === null ? (
        <p
          aria-live="polite"
          className="text-sm text-[--color-text-faint]"
          data-testid="spread-counter-empty"
        >
          Waiting for the first fill…
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3 text-sm">
          <a
            href={`${explorerBaseUrl}/${fill.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-[--color-text-muted] transition hover:text-[--color-text-default]"
            data-testid="spread-counter-tx-link"
          >
            <span className="truncate">
              {fill.txHash.slice(0, 10)}…{fill.txHash.slice(-6)}
            </span>
            <ExternalLink aria-hidden="true" className="size-3 text-[--color-text-faint]" />
          </a>
          {/* Per-fill delta uses the money color — same family as the Big
              Number. Mono+tabular so the digits align across consecutive fills. */}
          <span
            className="font-mono font-semibold tabular-nums text-[--color-money]"
            data-testid="spread-counter-delta"
          >
            +${USD_FORMATTER.format(fill.amountUSD)}
          </span>
        </div>
      )}
    </div>
  );
}

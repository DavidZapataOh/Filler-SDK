/**
 * `HeroCounter` — the "SPREAD CAPTURED" headline number. The demo's hero.
 *
 * Plan 01 ships the visual shell + a static value. Plan 03 wires the SSE
 * subscription + count-up animation; Plan 06 adds reconnect logic.
 *
 * Design decisions enforced here:
 *   - The Big Number is the ONLY element allowed to use pure white
 *     (`text-[--color-text-primary]`). design.txt: "Reserving white only
 *     for the most important actions." That's this number.
 *   - Mono font with tabular-nums so digits don't jiggle on increment.
 *   - The accent (emerald) appears as a faint glow halo behind the number,
 *     not on the number itself. The number is white; the *meaning* is
 *     captured spread; the halo signals the meaning without competing
 *     with the digit legibility.
 *   - The currency prefix ("$") and the unit suffix ("USD") are muted
 *     gray — they're labels, not data. design.txt: "below the name of
 *     the file, we have the size and type of file. This isn't super
 *     important information."
 */

import clsx from 'clsx';

interface HeroCounterProps {
  /** Captured spread in USD. Plan 01 takes a static prop; Plan 03 binds SSE. */
  amountUSD: number;
  className?: string;
}

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function HeroCounter({ amountUSD, className }: HeroCounterProps): JSX.Element {
  const formatted = USD_FORMATTER.format(amountUSD);

  return (
    <div className={clsx('relative flex flex-col items-center gap-3 py-12', className)}>
      {/* Faint emerald halo behind the number — establishes the money-flow
          mental model without painting the digit. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1/4 top-1/2 -z-10 h-32 -translate-y-1/2 rounded-full bg-[--color-money-faint] opacity-20 blur-3xl"
      />

      <p
        className={clsx(
          'text-xs font-medium uppercase tracking-[0.2em]',
          'text-[--color-text-muted]',
        )}
      >
        Spread captured
      </p>

      <div
        aria-label={`${formatted} US dollars captured`}
        className="flex items-baseline gap-1.5 font-mono"
      >
        <span className="text-3xl font-semibold text-[--color-text-subtle]">$</span>
        <span
          // The ONE pure-white element on the page.
          className="text-7xl font-bold tracking-tight text-[--color-text-primary] tabular-nums sm:text-8xl"
          data-testid="hero-counter-amount"
        >
          {formatted}
        </span>
        <span className="text-base font-medium text-[--color-text-muted]">USD</span>
      </div>

      <p className="max-w-md text-center text-sm text-[--color-text-muted]">
        Internalised by self-filling DAOs since session start. Every fill keeps spread inside the
        treasury that submitted the intent.
      </p>
    </div>
  );
}

/**
 * Hero — the demo's narrative-setting visual. First thing on the page.
 *
 * Split-screen: BEFORE (4 weeks of solver bringup) vs AFTER (30 s with
 * Filler SDK). Tagline below: "tres archivos y un bond."
 *
 * Layout decisions:
 *
 *   - Both columns share the SAME background — `--color-canvas`. The visual
 *     contrast comes from the columns' content, NOT from a cyan-tinted
 *     gradient on the AFTER side. design.txt: "almost never will you want
 *     bright colors for your background." Plan 02's markdown sketched a
 *     `bg-gradient from-cyan-950/40` on the AFTER side — we deviate
 *     deliberately. (Logged as F-43.)
 *
 *   - A single thin vertical border separates the columns on `lg:`+
 *     screens; on small screens the columns stack with a horizontal
 *     border between them. design.txt: "sometimes a simple border is the
 *     best solution."
 *
 *   - The h1 heading lives here (page rank-1 heading). Each column gets
 *     its own h2 ("Before" / "After" badges + the column title). The
 *     tagline beneath uses the mono font as a small typographic flourish
 *     that ties to "tres archivos" (three files, code-shape).
 */

import { Calendar, Zap } from 'lucide-react';

import { CalendarTimelapse } from './CalendarTimelapse';
import { ThirtySecondCounter } from './ThirtySecondCounter';

export function Hero(): JSX.Element {
  return (
    <section
      aria-labelledby="hero-headline"
      className="border-b border-[--color-border-subtle] bg-[--color-canvas]"
    >
      <h1 id="hero-headline" className="sr-only">
        Build a UniswapX solver — before and after Filler SDK
      </h1>

      <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-2">
        <BeforeColumn />
        <AfterColumn />
      </div>

      <Tagline />
    </section>
  );
}

// === BEFORE ==============================================================

function BeforeColumn(): JSX.Element {
  return (
    <div
      // Border — bottom on stacked, right on side-by-side. No background tint.
      className="flex flex-col gap-6 border-b border-[--color-border-subtle] px-6 py-12 sm:px-10 lg:border-b-0 lg:border-r lg:py-16"
    >
      <ColumnLabel
        icon={
          // Icon = NO color (per design.txt). Subtle gray, lets the LABEL
          // text carry the meaning.
          <Calendar aria-hidden="true" className="size-3.5 text-[--color-text-faint]" />
        }
        text="Before"
        // The "Before" badge text uses muted gray — labels are not the data.
        className="text-[--color-text-muted]"
      />
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-[--color-text-default] sm:text-4xl">
        Build a UniswapX solver
      </h2>
      <p className="text-base text-[--color-text-muted] sm:text-lg">
        4 weeks of infrastructure. Indexer, inventory, atomic JIT, hardening — each phase is its own
        debugging swamp.
      </p>
      <CalendarTimelapse className="mt-2" />
    </div>
  );
}

// === AFTER ===============================================================

function AfterColumn(): JSX.Element {
  return (
    <div className="flex flex-col gap-6 px-6 py-12 sm:px-10 lg:py-16">
      <ColumnLabel
        icon={
          // Same icon-no-color rule. The label text gets a faint emerald
          // tint to subliminally connect "after" to the money outcome —
          // but stays muted enough not to compete with the captured number.
          <Zap aria-hidden="true" className="size-3.5 text-[--color-text-faint]" />
        }
        text="After"
        className="text-[--color-money]/80"
      />
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-[--color-text-default] sm:text-4xl">
        <span className="rounded-md border border-[--color-border-subtle] bg-[--color-surface-2] px-2 py-1 font-mono text-2xl text-[--color-text-default] sm:text-3xl">
          npm install
        </span>
      </h2>
      <p className="text-base text-[--color-text-muted] sm:text-lg">
        First fill in 30 seconds. Bond once, subscribe to intents, capture spread. The SDK handles
        the four-week swamp for you.
      </p>
      <ThirtySecondCounter className="mt-2" />
    </div>
  );
}

// === Tagline =============================================================

function Tagline(): JSX.Element {
  return (
    <div className="border-t border-[--color-border-subtle] bg-[--color-surface-1]">
      <div className="mx-auto max-w-6xl px-6 py-10 text-center sm:px-10 sm:py-12">
        <p
          // Mono font + slight letter-spacing makes it feel "code-ish" —
          // ties to "tres archivos" (three FILES). Pure white reservation
          // is for the live counter Big Number; the tagline uses the
          // default text token so it's prominent but not loud.
          className="font-mono text-xl font-semibold tracking-tight text-[--color-text-default] sm:text-2xl"
        >
          &ldquo;Tres archivos y un bond.&rdquo;
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[--color-text-subtle]">
          The SDK to deploy vertical UniswapX solvers in&nbsp;
          <span className="font-mono normal-case tracking-normal">npm install</span>
        </p>
      </div>
    </div>
  );
}

// === Helpers =============================================================

interface ColumnLabelProps {
  icon: JSX.Element;
  text: string;
  className?: string;
}

function ColumnLabel({ icon, text, className }: ColumnLabelProps): JSX.Element {
  return (
    <p
      className={[
        'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon}
      {text}
    </p>
  );
}

/**
 * Dashboard root. Plan 02 ships the Hero (before/after split-screen) above
 * the live capture section. Plans 03/04/05/06/07 attach to the placeholder
 * grid + the LiveCaptured section.
 *
 *   - Plan 02 — Hero before/after (THIS plan, lands at top)
 *   - Plan 03 — LiveCaptured wired to SSE (replaces static placeholder)
 *   - Plan 04 — JIT depth chart (placeholder grid)
 *   - Plan 05 — Three Files Reveal (placeholder grid)
 *   - Plan 06 — SSE hooks (drives Plan 03 / 04 state)
 *   - Plan 07 — Replay mode (deterministic offline demo)
 *
 * Layout decisions (60-30-10 reminder):
 *   - 60% canvas: zinc-950 page bg + zinc-900-ish surface for cards.
 *   - 30% text: zinc-200/400 — readable without screaming.
 *   - 10% money: emerald reserved for the money counters.
 *
 * Borders > extra background layers — design.txt: "sometimes a simple
 * border is the best solution."
 */

import { ArrowUpRight, Github } from 'lucide-react';

import { Hero } from './components/Hero/Hero';
import { HeroCounter } from './components/HeroCounter';
import { LiveBadge } from './components/LiveBadge';

export function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-[--color-canvas]">
      <Header />
      <Hero />
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 pt-16 pb-24 sm:px-8">
        <LiveCapturedSection />
        <PlaceholderGrid />
      </main>
      <Footer />
    </div>
  );
}

// === Header ==============================================================

function Header(): JSX.Element {
  return (
    <header className="border-b border-[--color-border-subtle]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-sm font-semibold text-[--color-text-default]">Filler SDK</span>
          <span className="hidden text-xs text-[--color-text-subtle] sm:inline">
            · Tres archivos y un bond
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Plan 01 placeholder — Plan 06 wires the real SSE state in. */}
          <LiveBadge status="live" />
          <a
            href="https://github.com/filler-sdk/filler-sdk"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-[--color-border-subtle] px-2.5 py-1 text-xs text-[--color-text-muted] transition hover:bg-[--color-surface-2] hover:text-[--color-text-default]"
            aria-label="Filler SDK on GitHub"
          >
            <Github aria-hidden="true" className="size-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * Brandmark — a 16×16 emerald square with a dot inside, evoking "spread
 * captured into a vault." No PNG asset; pure CSS so the page has zero image
 * requests on first paint (LCP friendly).
 */
function BrandMark(): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex size-5 items-center justify-center rounded-md border border-[--color-border-default] bg-[--color-surface-2]"
    >
      <span className="size-1.5 rounded-full bg-[--color-money]" />
    </span>
  );
}

// === Live capture (Plan 03 wires SSE) ====================================

function LiveCapturedSection(): JSX.Element {
  return (
    <section
      aria-labelledby="live-capture-title"
      className="flex flex-col items-center gap-2 text-center"
    >
      <h2
        id="live-capture-title"
        className="text-balance text-2xl font-semibold tracking-tight text-[--color-text-default] sm:text-3xl"
      >
        DAO treasuries internalising their own spread,{' '}
        <span className="text-[--color-text-muted]">live.</span>
      </h2>
      <p className="max-w-2xl text-sm text-[--color-text-muted] sm:text-base">
        Every intent submitted by a self-filling DAO keeps the spread that would otherwise leave to
        an external aggregator. Watch the cumulative capture in real time.
      </p>

      {/* Plan 01: static placeholder. Plan 03 swaps to SSE-driven. */}
      <HeroCounter amountUSD={0} className="mt-4 w-full" />
    </section>
  );
}

// === Placeholder grid (Plans 03 / 04 / 05 land here) =====================

function PlaceholderGrid(): JSX.Element {
  return (
    <section aria-label="Visualisation slots" className="grid gap-6 sm:grid-cols-2">
      <Card
        title="JIT depth"
        body="Plan 04 binds the live area chart from the indexer's depth feed."
      />
      <Card
        title="Three files"
        body="Plan 05 reveals strategy.ts + filler.ts + stake.ts side-by-side."
      />
      <Card title="Recent fills" body="Plan 03 streams every spread-captured event as it lands." />
      <Card
        title="Replay mode"
        body="Plan 07 ships deterministic offline fixtures for demo recording."
      />
    </section>
  );
}

interface CardProps {
  title: string;
  body: string;
}

/**
 * Card — uses borders, NOT a heavier background layer. design.txt:
 * "sometimes a simple border is the best solution. A common challenge
 * designers face is working with the brand colors that are provided."
 *
 * The card is a placeholder until Plans 02-05 fill in real content; the
 * shape it offers (title + body, hover affordance) is what those plans
 * will inherit.
 */
function Card({ title, body }: CardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-[--color-border-subtle] bg-[--color-surface-1] p-5 transition hover:border-[--color-border-default]">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[--color-text-default]">{title}</h3>
        <ArrowUpRight aria-hidden="true" className="size-4 text-[--color-text-faint]" />
      </div>
      <p className="text-sm text-[--color-text-muted]">{body}</p>
    </div>
  );
}

// === Footer ==============================================================

function Footer(): JSX.Element {
  return (
    <footer className="border-t border-[--color-border-subtle]">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-xs text-[--color-text-subtle] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>Filler SDK is MIT-licensed. Self-host the indexer, the SDK, and the contracts.</span>
        <span className="font-mono text-[--color-text-faint]">tres archivos y un bond</span>
      </div>
    </footer>
  );
}

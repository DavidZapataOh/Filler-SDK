/**
 * Dashboard root. Plan 06 wires SSE hooks to drive the live counter, the
 * JIT depth chart, and the header LiveBadge.
 *
 *   - Plan 02 — Hero before/after (top)
 *   - Plan 03 — SpreadCounter (consumes useSpreadStream)
 *   - Plan 04 — JITDepthChart (consumes useDepthStream)
 *   - Plan 05 — ThreeFilesReveal (auto-play)
 *   - Plan 06 — useSSE hooks (THIS plan: wires sources)
 *   - Plan 07 — Replay mode (will swap sources for fixtures)
 *
 * Env-var driven sources:
 *   - `VITE_SPREAD_EMITTER_URL` → treasury-rebalance dashboard emitter
 *     (default: unset → empty state).
 *   - `VITE_DEPTH_INDEXER_URL` → jit-hints indexer (default: unset).
 *   - `VITE_DEPTH_POOL` → pool address for the depth chart.
 *
 * Without env vars the dashboard renders fully (skeletons + empty-state
 * copy) so judges browsing the deployed page see the intended visuals
 * without needing a local solver running.
 */

import { ArrowUpRight, Github } from 'lucide-react';
import { useMemo } from 'react';

import { Hero } from './components/Hero/Hero';
import { JITDepthChart } from './components/JITDepthChart';
import { LiveBadge } from './components/LiveBadge';
import { SpreadCounter } from './components/SpreadCounter';
import { ThreeFilesReveal } from './components/ThreeFilesReveal';
import { type DepthStreamParams, useDepthStream } from './hooks/useDepthStream';
import { useSpreadStream } from './hooks/useSpreadStream';

/** Default pool when VITE_DEPTH_POOL is unset — Unichain USDC/ETH 0.05%. */
const DEFAULT_POOL = '0x0000000000000000000000000000000000000000';
const DEFAULT_TRADE_SIZE = 1_000_000n; // 1 USDC at 6 decimals

export function App(): JSX.Element {
  const spreadEmitter = import.meta.env.VITE_SPREAD_EMITTER_URL;
  const depthIndexer = import.meta.env.VITE_DEPTH_INDEXER_URL;
  const depthPool = import.meta.env.VITE_DEPTH_POOL ?? DEFAULT_POOL;

  const spread = useSpreadStream(spreadEmitter);

  // Memoise the params object identity — the hook already memoises the
  // URL on shallow params, but a new object literal each render would
  // also be fine (the URL is the actual cache key). Keeping it stable
  // documents the pattern for callers.
  const depthParams = useMemo<DepthStreamParams>(
    () => ({ pool: depthPool, size: DEFAULT_TRADE_SIZE, zeroForOne: true }),
    [depthPool],
  );
  const depth = useDepthStream(depthIndexer, depthParams);

  return (
    <div className="min-h-screen bg-[--color-canvas]">
      <Header badgeStatus={spread.badgeStatus} />
      <Hero />
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 pt-16 pb-24 sm:px-8">
        <LiveCapturedSection source={spread.events} />
        <VisualisationGrid depthSource={depth.events} />
      </main>
      <Footer />
    </div>
  );
}

// === Header ==============================================================

function Header({
  badgeStatus,
}: {
  badgeStatus: 'live' | 'degraded' | 'disconnected';
}): JSX.Element {
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
          {/* Plan 06: badge status reflects the spread-stream connection.
              When VITE_SPREAD_EMITTER_URL is unset, status=disconnected. */}
          <LiveBadge status={badgeStatus} />
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

// === Live capture (Plan 03 + Plan 06 wiring) =============================

import type { DepthSnapshot } from './components/JITDepthChart';
import type { SpreadEvent } from './components/SpreadCounter';

function LiveCapturedSection({
  source,
}: {
  source: AsyncIterable<SpreadEvent>;
}): JSX.Element {
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
      <SpreadCounter source={source} className="mt-4 w-full max-w-2xl" />
    </section>
  );
}

// === Visualisation grid (Plans 04 / 05 / 07 land here) ===================

function VisualisationGrid({
  depthSource,
}: {
  depthSource: AsyncIterable<DepthSnapshot>;
}): JSX.Element {
  return (
    <section aria-label="Visualisation slots" className="grid gap-6 lg:grid-cols-2">
      <JITDepthChart pool="USDC/ETH 0.05%" source={depthSource} className="lg:col-span-2" />
      <ThreeFilesReveal className="lg:col-span-2" />
      <Card
        title="Recent fills"
        body="The last 10 spread-captured events scroll here once SSE is wired."
      />
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
 * "sometimes a simple border is the best solution."
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

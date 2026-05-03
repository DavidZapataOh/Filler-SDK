/**
 * Dashboard root.
 *
 *   - Plan 02 — Hero before/after (top)
 *   - Plan 03 — SpreadCounter (consumes useSpreadStream OR replay)
 *   - Plan 04 — JITDepthChart (consumes useDepthStream OR replay)
 *   - Plan 05 — ThreeFilesReveal (auto OR replay-driven step)
 *   - Plan 06 — useSSE hooks (live data sources)
 *   - Plan 07 — useReplayMode (THIS plan: deterministic offline demo)
 *
 * Mode resolution:
 *
 *   - `?replay=treasury|lvr|simple` → replay mode. Sources come from
 *     bundled fixtures; ThreeFilesReveal switches to manual + step is
 *     driven by fixture timeline. NO network calls.
 *   - Otherwise → live mode. SSE hooks read env-var URLs (or render the
 *     skeleton / disconnected state when env unset).
 *
 * The branching is centralized here so individual components stay
 * transport-agnostic — they consume an `AsyncIterable<T>` regardless of
 * source.
 */

import { Github } from 'lucide-react';
import { useMemo } from 'react';

import { Hero } from './components/Hero/Hero';
import type { DepthSnapshot } from './components/JITDepthChart';
import { JITDepthChart } from './components/JITDepthChart';
import { LiveBadge } from './components/LiveBadge';
import type { SpreadEvent } from './components/SpreadCounter';
import { SpreadCounter } from './components/SpreadCounter';
import { ThreeFilesReveal } from './components/ThreeFilesReveal';
import { type DepthStreamParams, useDepthStream } from './hooks/useDepthStream';
import { useReplayMode } from './hooks/useReplayMode';
import { useSpreadStream } from './hooks/useSpreadStream';

const DEFAULT_POOL = '0x0000000000000000000000000000000000000000';
const DEFAULT_TRADE_SIZE = 1_000_000n;

export function App(): JSX.Element {
  const replay = useReplayMode();

  // Live SSE hooks always run; their return value is only USED when not in
  // replay mode. We could conditionally call them — but conditional hooks
  // violate React's rules. Keeping them mounted with `undefined` URLs in
  // replay mode means status=`idle` + no EventSource constructed, so
  // there's no real cost.
  const spreadEmitterUrl = replay.enabled ? undefined : import.meta.env.VITE_SPREAD_EMITTER_URL;
  const depthIndexerUrl = replay.enabled ? undefined : import.meta.env.VITE_DEPTH_INDEXER_URL;
  const depthPool = import.meta.env.VITE_DEPTH_POOL ?? DEFAULT_POOL;

  const liveSpread = useSpreadStream(spreadEmitterUrl);
  const depthParams = useMemo<DepthStreamParams>(
    () => ({ pool: depthPool, size: DEFAULT_TRADE_SIZE, zeroForOne: true }),
    [depthPool],
  );
  const liveDepth = useDepthStream(depthIndexerUrl, depthParams);

  // Pick the active sources + badge state.
  const spreadSource: AsyncIterable<SpreadEvent> = replay.enabled
    ? replay.spreadSource
    : liveSpread.events;
  const depthSource: AsyncIterable<DepthSnapshot> = replay.enabled
    ? replay.depthSource
    : liveDepth.events;
  const badgeStatus: 'live' | 'degraded' | 'disconnected' = replay.enabled
    ? 'live'
    : liveSpread.badgeStatus;

  return (
    <div className="min-h-screen bg-[--color-canvas]">
      <Header
        badgeStatus={badgeStatus}
        replayName={replay.enabled ? (replay.fixture?.name ?? null) : null}
      />
      <Hero />
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 pt-16 pb-24 sm:px-8">
        <LiveCapturedSection source={spreadSource} />
        <VisualisationGrid
          depthSource={depthSource}
          replayMode={replay.enabled}
          replayThreeFilesStep={replay.threeFilesStep}
        />
      </main>
      <Footer />
    </div>
  );
}

// === Header ==============================================================

function Header({
  badgeStatus,
  replayName,
}: {
  badgeStatus: 'live' | 'degraded' | 'disconnected';
  replayName: string | null;
}): JSX.Element {
  return (
    <header className="border-b border-[--color-border-subtle]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-sm font-semibold text-[--color-text-default]">Filler SDK</span>
          <span className="hidden text-xs text-[--color-text-subtle] sm:inline">
            · Three files and a bond
          </span>
        </div>

        <div className="flex items-center gap-3">
          {replayName !== null && <ReplayBadge name={replayName} />}
          <LiveBadge status={badgeStatus} />
          <a
            href="https://github.com/DavidZapataOh/filler-sdk"
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
 * REPLAY badge — visible whenever ?replay=… is set. Honest scope: judges
 * should see at a glance that the demo is fixture-driven (NOT pretending
 * to be live). Plain neutral chrome — no money-color, no live-color.
 *
 * design.txt: icons + status carry color; the replay state is informational,
 * not a status alert, so we keep it gray.
 */
function ReplayBadge({ name }: { name: string }): JSX.Element {
  return (
    <span
      data-testid="replay-badge"
      className="inline-flex items-center gap-1.5 rounded-full border border-[--color-border-default] bg-[--color-surface-2] px-2.5 py-1 text-xs font-mono text-[--color-text-muted]"
    >
      <span aria-hidden="true" className="text-[--color-text-faint]">
        ▶
      </span>
      <span>
        replay <span className="text-[--color-text-default]">{name}</span>
      </span>
    </span>
  );
}

function BrandMark(): JSX.Element {
  return (
    <img
      src="/filler.svg"
      alt=""
      aria-hidden="true"
      className="size-6 rounded-md"
    />
  );
}

// === Live capture ========================================================

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

// === Visualisation grid ===================================================

function VisualisationGrid({
  depthSource,
  replayMode,
  replayThreeFilesStep,
}: {
  depthSource: AsyncIterable<DepthSnapshot>;
  replayMode: boolean;
  replayThreeFilesStep: number;
}): JSX.Element {
  return (
    <section aria-label="Visualisation slots" className="grid gap-6 lg:grid-cols-2">
      <JITDepthChart pool="USDC/ETH 0.05%" source={depthSource} className="lg:col-span-2" />
      {/* In replay mode the reveal is driven by the fixture timeline.
          Otherwise it auto-plays on mount (Plan 05 default). */}
      {replayMode ? (
        <ThreeFilesReveal trigger="manual" step={replayThreeFilesStep} className="lg:col-span-2" />
      ) : (
        <ThreeFilesReveal className="lg:col-span-2" />
      )}
    </section>
  );
}

// === Footer ==============================================================

function Footer(): JSX.Element {
  return (
    <footer className="border-t border-[--color-border-subtle]">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-xs text-[--color-text-subtle] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>Filler SDK is MIT-licensed. Self-host the indexer, the SDK, and the contracts.</span>
        <span className="font-mono text-[--color-text-faint]">three files and a bond</span>
      </div>
    </footer>
  );
}

/**
 * JITDepthChart — recharts area chart of pool tick liquidity.
 *
 * Live updates from an `AsyncIterable<DepthSnapshot>` (Plan 06 will produce
 * one via the SSE indexer adapter). The point of this chart is the demo
 * narrative: "depth that the Trading API doesn't expose." Showing the
 * shape of liquidity around the active tick + highlighting the JIT range
 * the solver just added makes the value of the SDK visible without words.
 *
 * Design system applied:
 *   - The depth area = cyan (`--color-live`). Live data flow color from
 *     Plan 01. Saturated stroke at the curve, fading transparent toward
 *     the X-axis.
 *   - The JIT range overlay = emerald (`--color-money`). It's the
 *     solver's *contribution* — capital we provided to capture spread —
 *     so it gets the money color. Plan markdown sketched amber here;
 *     amber is reserved for warn/degraded status (Plan 01 design system),
 *     and the JIT range is not a warning. Logged as F-43 territory.
 *   - The current-tick marker = pure white (`--color-text-primary`).
 *     Pure white is the page's "most important point of attention" token;
 *     the cursor showing where the price is RIGHT NOW gets that role.
 *   - Axis ticks + labels = muted grays. Per design.txt: "below the name
 *     of the file, we have the size and type of file. This isn't super
 *     important information."
 *
 * Accessibility:
 *   - The chart is wrapped in `<figure role="img" aria-label="...">` so SR
 *     readers get a one-line summary of what the chart shows. recharts'
 *     SVG output is non-semantic by default (F-48). The label updates
 *     when new snapshots arrive.
 *   - A `<figcaption>` reinforces the JIT-range explanation when present.
 *
 * Performance:
 *   - `isAnimationActive={false}` on the Area — recharts' default ease-in
 *     animation trails badly under fast SSE updates (every snapshot would
 *     animate from the previous, creating overlapping curves). Snap-render
 *     is the right behavior for live data.
 *   - recharts is in its own vite chunk (Plan 01's manualChunks). First
 *     paint of this chart triggers the vendor chunk download (~70 KB gz).
 */

import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface DepthTick {
  /** Pool tick (price representation in v3/v4). */
  tick: number;
  /** Liquidity available at this tick (raw L value). */
  liquidity: number;
}

export interface DepthSnapshot {
  /** Sorted ticks ascending. */
  ticks: DepthTick[];
  /** Active tick — where the price is right now. */
  currentTick: number;
  /** Range of the most recent JIT-add, if any. Disappears once the JIT unwinds. */
  jitRange?: { tickLower: number; tickUpper: number };
}

interface JITDepthChartProps {
  /** Pool label shown in the header (e.g. "USDC/ETH 0.05%"). */
  pool: string;
  /**
   * Async source of depth snapshots. Plan 06's `useSSE` hook will produce
   * one; tests pass a mock generator; replay-mode (Plan 07) ships a
   * deterministic finite source. When undefined, renders the skeleton.
   */
  source?: AsyncIterable<DepthSnapshot> | undefined;
  className?: string;
}

const CHART_HEIGHT = 280;

export function JITDepthChart({ pool, source, className }: JITDepthChartProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<DepthSnapshot | null>(null);

  useEffect(() => {
    if (source === undefined) return;

    let cancelled = false;
    void (async () => {
      try {
        for await (const snap of source) {
          if (cancelled) break;
          setSnapshot(snap);
        }
      } catch {
        // Source threw — keep the last snapshot on screen. Plan 06's
        // SSE hook handles reconnect; we don't crash the UI.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <Card className={className}>
      <Header pool={pool} />
      {snapshot === null ? <Skeleton /> : <Chart snapshot={snapshot} />}
    </Card>
  );
}

// === Card chrome =========================================================

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}): JSX.Element {
  return (
    <div
      className={[
        'rounded-2xl border border-[--color-border-subtle] bg-[--color-surface-1] p-5 sm:p-6',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

function Header({ pool }: { pool: string }): JSX.Element {
  return (
    <header className="mb-4 flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[--color-text-subtle]">
        JIT Depth ·{' '}
        <span className="font-mono normal-case tracking-normal text-[--color-text-muted]">
          {pool}
        </span>
      </p>
      <p className="text-sm text-[--color-text-muted]">
        Liquidity that the Trading API doesn&apos;t expose.
      </p>
    </header>
  );
}

// === Skeleton ============================================================

function Skeleton(): JSX.Element {
  return (
    <div
      // animate-pulse here is correct: it's a true loading-skeleton state
      // (per F-44's framing — pulse means loading, NOT "passage of time").
      className="motion-safe:animate-pulse flex items-center justify-center rounded-md border border-dashed border-[--color-border-subtle] bg-[--color-surface-2]/40 text-sm text-[--color-text-faint]"
      style={{ height: CHART_HEIGHT }}
      data-testid="jit-depth-skeleton"
      aria-live="polite"
    >
      Waiting for depth data…
    </div>
  );
}

// === Chart ===============================================================

interface ChartProps {
  snapshot: DepthSnapshot;
}

function Chart({ snapshot }: ChartProps): JSX.Element {
  const { ticks, currentTick, jitRange } = snapshot;
  const ariaLabel = buildChartLabel(snapshot);

  return (
    <figure
      role="img"
      aria-label={ariaLabel}
      data-testid="jit-depth-chart"
      // Don't drop the figure into a margined block — recharts'
      // ResponsiveContainer wants the parent to drive its width.
      className="m-0"
    >
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={ticks} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {/* Depth fill — cyan, fades to transparent. */}
              <linearGradient id="depth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-live)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--color-live)" stopOpacity={0} />
              </linearGradient>
              {/* JIT range fill — emerald (NOT amber). The JIT-add is
                  the solver's contribution; it gets the money color. */}
              <linearGradient id="jit-range-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-money)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--color-money)" stopOpacity={0.08} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="tick"
              stroke="var(--color-border-default)"
              tick={{ fill: 'var(--color-text-subtle)', fontSize: 11 }}
              tickFormatter={formatTick}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              stroke="var(--color-border-default)"
              tick={{ fill: 'var(--color-text-subtle)', fontSize: 11 }}
              tickFormatter={formatLiquidity}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              content={<DepthTooltip />}
              cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
            />

            {jitRange !== undefined && (
              <ReferenceArea
                x1={jitRange.tickLower}
                x2={jitRange.tickUpper}
                fill="url(#jit-range-fill)"
                stroke="var(--color-money)"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
              />
            )}

            <ReferenceLine
              x={currentTick}
              // Pure white = "most important point of attention." The
              // current-tick marker is where the price is RIGHT NOW.
              stroke="var(--color-text-primary)"
              strokeOpacity={0.7}
              strokeDasharray="2 2"
            />

            <Area
              dataKey="liquidity"
              type="monotone"
              stroke="var(--color-live)"
              strokeWidth={2}
              fill="url(#depth-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {jitRange !== undefined && (
        <figcaption
          // Caption uses muted gray + emerald only on the "JIT add" label —
          // mirrors the pattern from SpreadCounter's per-fill delta.
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[--color-text-muted]"
          data-testid="jit-depth-caption"
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-sm bg-[--color-money]/60"
            />
            <span className="font-mono text-[--color-money]">JIT add</span>
          </span>
          <span className="font-mono text-[--color-text-faint]">
            ticks [{jitRange.tickLower.toLocaleString()}, {jitRange.tickUpper.toLocaleString()}]
          </span>
        </figcaption>
      )}
    </figure>
  );
}

// === Tooltip =============================================================

interface TooltipPayload {
  value?: number | string;
  payload?: { tick: number };
}

interface DepthTooltipProps {
  active?: boolean;
  // recharts passes `label` as the X-axis category (the tick value).
  label?: number | string;
  payload?: TooltipPayload[];
}

function DepthTooltip({ active, label, payload }: DepthTooltipProps): JSX.Element | null {
  if (active !== true) return null;
  const first = payload?.[0];
  if (first === undefined) return null;
  const liquidity = typeof first.value === 'number' ? first.value : Number(first.value ?? 0);
  return (
    <div
      role="tooltip"
      className="rounded-md border border-[--color-border-default] bg-[--color-surface-2] px-3 py-2 text-xs shadow-lg"
    >
      <Row
        label="tick"
        value={typeof label === 'number' ? label.toLocaleString() : String(label ?? '')}
      />
      <Row label="depth" value={formatLiquidity(liquidity)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <p className="flex items-center justify-between gap-3 font-mono">
      <span className="text-[--color-text-subtle]">{label}</span>
      <span className="text-[--color-text-default] tabular-nums">{value}</span>
    </p>
  );
}

// === Helpers =============================================================

function formatTick(tick: number | string): string {
  const n = typeof tick === 'number' ? tick : Number(tick);
  if (!Number.isFinite(n)) return String(tick);
  return n.toLocaleString();
}

function formatLiquidity(liq: number): string {
  if (!Number.isFinite(liq)) return '—';
  const abs = Math.abs(liq);
  if (abs >= 1e9) return `${(liq / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(liq / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(liq / 1e3).toFixed(0)}K`;
  return liq.toLocaleString();
}

function buildChartLabel(snapshot: DepthSnapshot): string {
  const { ticks, currentTick, jitRange } = snapshot;
  const parts = [
    `Pool depth chart with ${ticks.length} ticks`,
    `current tick ${currentTick.toLocaleString()}`,
  ];
  if (jitRange !== undefined) {
    parts.push(
      `JIT add range from ${jitRange.tickLower.toLocaleString()} to ${jitRange.tickUpper.toLocaleString()}`,
    );
  }
  return parts.join(', ');
}

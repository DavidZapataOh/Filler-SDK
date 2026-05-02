/**
 * Treasury rebalance fixture — DAO internalisation demo.
 *
 * 90-second timeline modelling a $50M Q3 quarterly rebalance executing as
 * 10 fills over the recording window. Spread captured per fill ranges from
 * a small ($312) opportunistic micro-rebalance to a heavy ($2891) primary
 * tranche. Cumulative ends at ~$12,938 — a realistic first-90-second
 * snapshot of internalised spread for a treasury rebalance flow.
 *
 * Numbers are illustrative (we shipped the same disclaimer in
 * Hero/ThirtySecondCounter for the static $1,247 demo).
 */

import type { Fixture } from './types';

// Pre-computed cumulative running totals so SpreadCounter's
// totalUSD-from-server invariant (F-45) holds in replay too.
const SPREADS = [
  { atMs: 5_000, amountUSD: 312, totalUSD: 312, blockNumber: '21000010' },
  { atMs: 12_000, amountUSD: 487, totalUSD: 799, blockNumber: '21000038' },
  { atMs: 19_000, amountUSD: 1_024, totalUSD: 1_823, blockNumber: '21000067' },
  { atMs: 26_000, amountUSD: 645, totalUSD: 2_468, blockNumber: '21000095' },
  { atMs: 33_000, amountUSD: 1_832, totalUSD: 4_300, blockNumber: '21000124' },
  { atMs: 41_000, amountUSD: 2_103, totalUSD: 6_403, blockNumber: '21000156' },
  { atMs: 48_000, amountUSD: 891, totalUSD: 7_294, blockNumber: '21000184' },
  { atMs: 55_000, amountUSD: 1_547, totalUSD: 8_841, blockNumber: '21000213' },
  { atMs: 62_000, amountUSD: 2_891, totalUSD: 11_732, blockNumber: '21000241' },
  { atMs: 70_000, amountUSD: 1_206, totalUSD: 12_938, blockNumber: '21000273' },
] as const;

const REPLAY_EPOCH_MS = 1_730_000_000_000;

/** Tx hash builder — visibly synthetic, deterministic across runs. */
function hash(prefix: 'tx' | 'order', n: number): `0x${string}` {
  const tag = prefix === 'tx' ? 'a' : 'b';
  return `0x${tag.repeat(63)}${n.toString(16)}` as `0x${string}`;
}

/**
 * Tick liquidity profile around `currentTick`. Returns a rolled-off
 * curve: more liquidity near the active tick, falling off at the wings.
 * Realistic shape for a USDC/ETH 0.05% pool depth snapshot.
 */
function depthCurve(
  currentTick: number,
  span = 10,
  step = 60,
): { tick: number; liquidity: number }[] {
  const ticks: { tick: number; liquidity: number }[] = [];
  for (let i = -span; i <= span; i += 1) {
    const tick = currentTick + i * step;
    const distance = Math.abs(i) / span;
    const base = 2_400_000;
    const liquidity = Math.round(base * (1 - 0.6 * distance ** 2));
    ticks.push({ tick, liquidity });
  }
  return ticks;
}

export const treasuryFixture: Fixture = {
  name: 'Treasury rebalance',
  vertical: 'treasury-rebalance',
  durationMs: 90_000,

  spreadEvents: SPREADS.map((s, i) => ({
    atMs: s.atMs,
    amountUSD: s.amountUSD,
    totalUSD: s.totalUSD,
    txHash: hash('tx', i + 1),
    orderHash: hash('order', i + 1),
    blockNumber: s.blockNumber,
    timestampMs: REPLAY_EPOCH_MS + s.atMs,
  })),

  depthSnapshots: [
    { atMs: 0, ticks: depthCurve(200_000), currentTick: 200_000 },
    {
      atMs: 5_000,
      ticks: depthCurve(200_010),
      currentTick: 200_010,
      jitRange: { tickLower: 199_950, tickUpper: 200_070 },
    },
    { atMs: 11_000, ticks: depthCurve(200_005), currentTick: 200_005 },
    {
      atMs: 19_000,
      ticks: depthCurve(199_980),
      currentTick: 199_980,
      jitRange: { tickLower: 199_920, tickUpper: 200_040 },
    },
    { atMs: 30_000, ticks: depthCurve(200_020), currentTick: 200_020 },
    {
      atMs: 41_000,
      ticks: depthCurve(200_050),
      currentTick: 200_050,
      jitRange: { tickLower: 199_990, tickUpper: 200_110 },
    },
    { atMs: 53_000, ticks: depthCurve(199_990), currentTick: 199_990 },
    {
      atMs: 62_000,
      ticks: depthCurve(199_960),
      currentTick: 199_960,
      jitRange: { tickLower: 199_900, tickUpper: 200_020 },
    },
    { atMs: 75_000, ticks: depthCurve(199_980), currentTick: 199_980 },
  ],

  threeFilesReveal: [
    { atMs: 75_500, step: 1 },
    { atMs: 76_300, step: 2 },
    { atMs: 77_100, step: 3 },
    { atMs: 77_900, step: 4 },
  ],
};

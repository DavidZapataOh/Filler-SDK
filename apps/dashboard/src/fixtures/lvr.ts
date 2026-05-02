/**
 * LVR-aware fixture — solver that filters for LP-favourable fills only.
 *
 * Narrative: many small captures because the LVR filter only takes fills
 * where `expectedLVRReduction > 0`. Cumulative is lower per-event than
 * treasury (each fill is a marginal LP-favorable trade) but EVENT COUNT is
 * higher (12 vs 10), telling the visual story "more selective filling."
 */

import type { Fixture } from './types';

const SPREADS = [
  { atMs: 4_000, amountUSD: 84, totalUSD: 84, blockNumber: '21000005' },
  { atMs: 9_500, amountUSD: 127, totalUSD: 211, blockNumber: '21000027' },
  { atMs: 15_000, amountUSD: 198, totalUSD: 409, blockNumber: '21000049' },
  { atMs: 22_000, amountUSD: 156, totalUSD: 565, blockNumber: '21000077' },
  { atMs: 28_500, amountUSD: 243, totalUSD: 808, blockNumber: '21000103' },
  { atMs: 35_000, amountUSD: 312, totalUSD: 1_120, blockNumber: '21000130' },
  { atMs: 42_000, amountUSD: 178, totalUSD: 1_298, blockNumber: '21000158' },
  { atMs: 48_500, amountUSD: 295, totalUSD: 1_593, blockNumber: '21000185' },
  { atMs: 55_000, amountUSD: 217, totalUSD: 1_810, blockNumber: '21000211' },
  { atMs: 61_500, amountUSD: 386, totalUSD: 2_196, blockNumber: '21000238' },
  { atMs: 68_000, amountUSD: 264, totalUSD: 2_460, blockNumber: '21000264' },
  { atMs: 73_000, amountUSD: 142, totalUSD: 2_602, blockNumber: '21000284' },
] as const;

const REPLAY_EPOCH_MS = 1_730_000_000_000;

function hash(prefix: 'tx' | 'order', n: number): `0x${string}` {
  const tag = prefix === 'tx' ? 'c' : 'd';
  return `0x${tag.repeat(63)}${n.toString(16)}` as `0x${string}`;
}

function depthCurve(
  currentTick: number,
  span = 10,
  step = 60,
): { tick: number; liquidity: number }[] {
  const ticks: { tick: number; liquidity: number }[] = [];
  for (let i = -span; i <= span; i += 1) {
    const tick = currentTick + i * step;
    const distance = Math.abs(i) / span;
    const base = 1_800_000;
    const liquidity = Math.round(base * (1 - 0.55 * distance ** 2));
    ticks.push({ tick, liquidity });
  }
  return ticks;
}

export const lvrFixture: Fixture = {
  name: 'LVR-aware solver',
  vertical: 'lvr-aware',
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
      atMs: 4_000,
      ticks: depthCurve(200_005),
      currentTick: 200_005,
      jitRange: { tickLower: 199_960, tickUpper: 200_050 },
    },
    {
      atMs: 15_000,
      ticks: depthCurve(199_990),
      currentTick: 199_990,
      jitRange: { tickLower: 199_950, tickUpper: 200_030 },
    },
    {
      atMs: 28_500,
      ticks: depthCurve(200_020),
      currentTick: 200_020,
      jitRange: { tickLower: 199_980, tickUpper: 200_060 },
    },
    { atMs: 38_000, ticks: depthCurve(200_010), currentTick: 200_010 },
    {
      atMs: 48_500,
      ticks: depthCurve(199_990),
      currentTick: 199_990,
      jitRange: { tickLower: 199_950, tickUpper: 200_030 },
    },
    {
      atMs: 61_500,
      ticks: depthCurve(199_995),
      currentTick: 199_995,
      jitRange: { tickLower: 199_955, tickUpper: 200_035 },
    },
    { atMs: 75_000, ticks: depthCurve(200_000), currentTick: 200_000 },
  ],

  threeFilesReveal: [
    { atMs: 75_500, step: 1 },
    { atMs: 76_300, step: 2 },
    { atMs: 77_100, step: 3 },
    { atMs: 77_900, step: 4 },
  ],
};

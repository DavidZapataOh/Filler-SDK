/**
 * Simple JIT fixture — baseline solver.
 *
 * Narrative: standard JIT solver fills mid-sized opportunities at moderate
 * cadence. Cumulative ~$5,800 over 90s. The narrative purpose: serves as
 * the "before LVR / before treasury internalisation" baseline that lets
 * judges see how the SDK's verticals differ on the same dashboard.
 */

import type { Fixture } from './types';

const SPREADS = [
  { atMs: 6_000, amountUSD: 412, totalUSD: 412, blockNumber: '21000012' },
  { atMs: 14_000, amountUSD: 587, totalUSD: 999, blockNumber: '21000044' },
  { atMs: 22_000, amountUSD: 824, totalUSD: 1_823, blockNumber: '21000076' },
  { atMs: 31_000, amountUSD: 645, totalUSD: 2_468, blockNumber: '21000112' },
  { atMs: 39_000, amountUSD: 532, totalUSD: 3_000, blockNumber: '21000144' },
  { atMs: 47_000, amountUSD: 703, totalUSD: 3_703, blockNumber: '21000176' },
  { atMs: 55_500, amountUSD: 891, totalUSD: 4_594, blockNumber: '21000210' },
  { atMs: 64_000, amountUSD: 547, totalUSD: 5_141, blockNumber: '21000244' },
  { atMs: 72_500, amountUSD: 666, totalUSD: 5_807, blockNumber: '21000278' },
] as const;

const REPLAY_EPOCH_MS = 1_730_000_000_000;

function hash(prefix: 'tx' | 'order', n: number): `0x${string}` {
  const tag = prefix === 'tx' ? 'e' : 'f';
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
    const base = 2_000_000;
    const liquidity = Math.round(base * (1 - 0.5 * distance ** 2));
    ticks.push({ tick, liquidity });
  }
  return ticks;
}

export const simpleFixture: Fixture = {
  name: 'Simple JIT',
  vertical: 'simple-jit',
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
      atMs: 6_000,
      ticks: depthCurve(200_010),
      currentTick: 200_010,
      jitRange: { tickLower: 199_970, tickUpper: 200_050 },
    },
    {
      atMs: 22_000,
      ticks: depthCurve(199_995),
      currentTick: 199_995,
      jitRange: { tickLower: 199_955, tickUpper: 200_035 },
    },
    {
      atMs: 39_000,
      ticks: depthCurve(200_015),
      currentTick: 200_015,
      jitRange: { tickLower: 199_975, tickUpper: 200_055 },
    },
    {
      atMs: 55_500,
      ticks: depthCurve(199_990),
      currentTick: 199_990,
      jitRange: { tickLower: 199_950, tickUpper: 200_030 },
    },
    {
      atMs: 72_500,
      ticks: depthCurve(200_005),
      currentTick: 200_005,
      jitRange: { tickLower: 199_965, tickUpper: 200_045 },
    },
  ],

  threeFilesReveal: [
    { atMs: 75_500, step: 1 },
    { atMs: 76_300, step: 2 },
    { atMs: 77_100, step: 3 },
    { atMs: 77_900, step: 4 },
  ],
};

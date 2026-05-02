import { describe, expect, test } from 'vitest';

import { ConfigInvalidError, InsufficientLiquidityError } from '../../src';
import {
  TICK_BOUNDS,
  calibrateTickRange,
  ceilToSpacing,
  floorToSpacing,
} from '../../src/fills/tickCalibration';
import { makeDepthHint, makeIntent, makePoolInfo } from './fixtures';

const { MIN_TICK, MAX_TICK } = TICK_BOUNDS;

// === Helpers ==============================================================

function calibrate(opts: {
  poolTickSpacing?: number;
  baseLower: number;
  baseUpper: number;
  baseLiquidity?: bigint;
  safetyMarginTicks?: number;
  maxLiquidityMultiplier?: bigint;
}) {
  const calibrationOptions: { safetyMarginTicks?: number; maxLiquidityMultiplier?: bigint } = {};
  if (opts.safetyMarginTicks !== undefined) {
    calibrationOptions.safetyMarginTicks = opts.safetyMarginTicks;
  }
  if (opts.maxLiquidityMultiplier !== undefined) {
    calibrationOptions.maxLiquidityMultiplier = opts.maxLiquidityMultiplier;
  }
  return calibrateTickRange({
    pool: makePoolInfo({ tickSpacing: opts.poolTickSpacing ?? 60 }),
    hint: makeDepthHint({
      tickLower: opts.baseLower,
      tickUpper: opts.baseUpper,
      ...(opts.baseLiquidity === undefined
        ? {}
        : { liquidityDelta: opts.baseLiquidity }),
    }),
    intent: makeIntent(),
    options: calibrationOptions,
  });
}

// === Pure helpers =========================================================

describe('floorToSpacing / ceilToSpacing', () => {
  test('floorToSpacing rounds down (positive)', () => {
    expect(floorToSpacing(125, 60)).toBe(120);
    expect(floorToSpacing(120, 60)).toBe(120);
    expect(floorToSpacing(119, 60)).toBe(60);
  });

  test('floorToSpacing handles negatives via Math.floor', () => {
    expect(floorToSpacing(-119, 60)).toBe(-120);
    expect(floorToSpacing(-120, 60)).toBe(-120);
    expect(floorToSpacing(-121, 60)).toBe(-180);
  });

  test('ceilToSpacing rounds up (positive)', () => {
    expect(ceilToSpacing(119, 60)).toBe(120);
    expect(ceilToSpacing(120, 60)).toBe(120);
    expect(ceilToSpacing(121, 60)).toBe(180);
  });

  test('ceilToSpacing handles negatives', () => {
    expect(ceilToSpacing(-125, 60)).toBe(-120);
    expect(ceilToSpacing(-120, 60)).toBe(-120);
    expect(ceilToSpacing(-119, 60)).toBe(-60);
  });
});

// === Plan 04 invariants that survived (input-side rejections) =============

describe('calibrateTickRange — input-side rejections', () => {
  test('rejects tickLower >= tickUpper from indexer', () => {
    expect(() =>
      calibrate({ baseLower: 120, baseUpper: -120 }),
    ).toThrow(InsufficientLiquidityError);
  });

  test('rejects baseLiquidity <= 0', () => {
    expect(() =>
      calibrate({ baseLower: -120, baseUpper: 120, baseLiquidity: 0n }),
    ).toThrow(/non-positive/);
  });

  test('rejects non-positive tickSpacing', () => {
    expect(() =>
      calibrate({ poolTickSpacing: 0, baseLower: -120, baseUpper: 120 }),
    ).toThrow(/tickSpacing/);
  });

  test('rejects non-integer ticks from indexer', () => {
    expect(() =>
      calibrate({ baseLower: -120.5, baseUpper: 120 }),
    ).toThrow(/non-integer/);
  });

  test('rejects negative safetyMarginTicks', () => {
    expect(() =>
      calibrate({
        baseLower: -120,
        baseUpper: 120,
        safetyMarginTicks: -1,
      }),
    ).toThrow(ConfigInvalidError);
  });

  test('rejects zero maxLiquidityMultiplier', () => {
    expect(() =>
      calibrate({
        baseLower: -120,
        baseUpper: 120,
        maxLiquidityMultiplier: 0n,
      }),
    ).toThrow(ConfigInvalidError);
  });
});

// === Plan 05 — snap behavior (was reject in Plan 04) ======================

describe('calibrateTickRange — snap to spacing (Plan 05 changed semantics)', () => {
  test('SNAPS misaligned tickLower DOWN, tickUpper UP', () => {
    // Hint: [-119, 121], spacing 60. Without margin:
    //   floor(-119 / 60) * 60 = floor(-1.98) * 60 = -2 * 60 = -120
    //   ceil(121 / 60) * 60 = ceil(2.01) * 60 = 3 * 60 = 180
    // With default margin=1: -120 - 60 = -180; 180 + 60 = 240; snap → -180, 240.
    const r = calibrate({
      baseLower: -119,
      baseUpper: 121,
      safetyMarginTicks: 0,
    });
    expect(r.tickLower).toBe(-120);
    expect(r.tickUpper).toBe(180);
    expect(Math.abs(r.tickLower % 60)).toBe(0);
    expect(Math.abs(r.tickUpper % 60)).toBe(0);
  });

  test('aligned ticks pass through unchanged when margin=0', () => {
    const r = calibrate({
      baseLower: -120,
      baseUpper: 120,
      safetyMarginTicks: 0,
    });
    expect(r.tickLower).toBe(-120);
    expect(r.tickUpper).toBe(120);
  });

  test('ticks aligned to a custom tickSpacing', () => {
    const r = calibrate({
      poolTickSpacing: 200,
      baseLower: -400,
      baseUpper: 600,
      safetyMarginTicks: 0,
    });
    expect(r.tickLower).toBe(-400);
    expect(r.tickUpper).toBe(600);
  });
});

// === Plan 05 — caps to MIN_TICK / MAX_TICK (was reject in Plan 04) ========

describe('calibrateTickRange — caps to global tick bounds', () => {
  test('caps tickLower below MIN_TICK to spacing-aligned MIN', () => {
    const r = calibrate({
      poolTickSpacing: 1,
      baseLower: -1_000_000, // below MIN_TICK = -887_272
      baseUpper: 100,
      safetyMarginTicks: 0,
    });
    expect(r.tickLower).toBe(MIN_TICK);
    expect(r.tickUpper).toBe(100);
  });

  test('caps tickUpper above MAX_TICK to spacing-aligned MAX', () => {
    const r = calibrate({
      poolTickSpacing: 1,
      baseLower: -100,
      baseUpper: 1_000_000, // above MAX_TICK = 887_272
      safetyMarginTicks: 0,
    });
    expect(r.tickLower).toBe(-100);
    expect(r.tickUpper).toBe(MAX_TICK);
  });

  test('caps both ends, preserves tickLower < tickUpper', () => {
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -1_000_000,
      baseUpper: 1_000_000,
      safetyMarginTicks: 0,
    });
    expect(r.tickLower).toBeGreaterThanOrEqual(MIN_TICK);
    expect(r.tickUpper).toBeLessThanOrEqual(MAX_TICK);
    expect(r.tickLower).toBeLessThan(r.tickUpper);
    expect(Math.abs(r.tickLower % 60)).toBe(0);
    expect(Math.abs(r.tickUpper % 60)).toBe(0);
  });
});

// === Plan 05 — safety margin ==============================================

describe('calibrateTickRange — safety margin', () => {
  test('default safetyMarginTicks = 1 widens the range by 1 tickSpacing per side', () => {
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -120,
      baseUpper: 120,
      // safetyMarginTicks not provided → default 1
    });
    expect(r.tickLower).toBe(-180);
    expect(r.tickUpper).toBe(180);
  });

  test('safetyMarginTicks=0 leaves range as-is', () => {
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -120,
      baseUpper: 120,
      safetyMarginTicks: 0,
    });
    expect(r.tickLower).toBe(-120);
    expect(r.tickUpper).toBe(120);
  });

  test('safetyMarginTicks=3 widens by 3 tickSpacings per side', () => {
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -120,
      baseUpper: 120,
      safetyMarginTicks: 3,
    });
    expect(r.tickLower).toBe(-300);
    expect(r.tickUpper).toBe(300);
  });
});

// === Plan 05 — liquidity scaling ==========================================

describe('calibrateTickRange — liquidity scaling', () => {
  test('proportional scaling with widened range', () => {
    // base: width 240; widened: width 360 (60-tick margin per side).
    // 100 * 360 / 240 = 150.
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -120,
      baseUpper: 120,
      baseLiquidity: 100n,
      safetyMarginTicks: 1,
      maxLiquidityMultiplier: 1000n,
    });
    expect(r.liquidityDelta).toBe(150n);
  });

  test('no scaling when range unchanged (margin=0)', () => {
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -120,
      baseUpper: 120,
      baseLiquidity: 100n,
      safetyMarginTicks: 0,
    });
    expect(r.liquidityDelta).toBe(100n);
  });

  test('caps growth at maxLiquidityMultiplier (default 10×)', () => {
    // Default cap = 10×. Widening by a huge margin would scale liquidity
    // 100×; the cap clamps it at 10×.
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -60,
      baseUpper: 60,
      baseLiquidity: 1n,
      safetyMarginTicks: 100, // → +6000 ticks per side, ratio ~100×
    });
    expect(r.liquidityDelta).toBeLessThanOrEqual(10n);
  });

  test('custom maxLiquidityMultiplier respected', () => {
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -60,
      baseUpper: 60,
      baseLiquidity: 1n,
      safetyMarginTicks: 100,
      maxLiquidityMultiplier: 3n,
    });
    expect(r.liquidityDelta).toBeLessThanOrEqual(3n);
  });
});

// === Plan 05 — output invariant always holds ==============================

describe('calibrateTickRange — output invariants', () => {
  test('tickLower < tickUpper always', () => {
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -60,
      baseUpper: 60,
      safetyMarginTicks: 1,
    });
    expect(r.tickLower).toBeLessThan(r.tickUpper);
  });

  test('both ticks aligned to spacing always', () => {
    const r = calibrate({
      poolTickSpacing: 200,
      baseLower: -1234,
      baseUpper: 5678,
      safetyMarginTicks: 0,
    });
    expect(Math.abs(r.tickLower % 200)).toBe(0);
    expect(Math.abs(r.tickUpper % 200)).toBe(0);
  });

  test('liquidityDelta > 0 always (or throws)', () => {
    const r = calibrate({
      poolTickSpacing: 60,
      baseLower: -120,
      baseUpper: 120,
      baseLiquidity: 1_000_000n,
      safetyMarginTicks: 0,
    });
    expect(r.liquidityDelta).toBeGreaterThan(0n);
  });
});

// === Fuzz: 1000 random hints, every output is valid =======================

/**
 * Deterministic seeded LCG (Numerical Recipes parameters). Using a plain
 * `Math.random()` would make CI runs non-reproducible. fast-check would be
 * the standard tool here but adding a 50KB dep just for one test isn't worth
 * it — a simple seeded PRNG gives the same coverage with shrinking handled
 * by hand-picked hard cases above.
 */
function makePrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('calibrateTickRange — fuzz (1000 deterministic random inputs)', () => {
  test('every result satisfies engine + on-chain invariants', () => {
    const rand = makePrng(0xC0FFEE);
    const tickSpacings = [1, 10, 60, 200, 2000];
    const failures: string[] = [];

    for (let i = 0; i < 1000; i++) {
      const tickSpacing = tickSpacings[Math.floor(rand() * tickSpacings.length)] ?? 60;
      // Pick valid input in-range [MIN_TICK + 1000, MAX_TICK - 1000].
      const span = MAX_TICK - MIN_TICK - 2000;
      const baseLower = MIN_TICK + 1000 + Math.floor(rand() * span);
      const widthMax = Math.min(50_000, MAX_TICK - 1000 - baseLower);
      const baseUpper = baseLower + 1 + Math.floor(rand() * Math.max(1, widthMax));
      const baseLiquidity =
        BigInt(1 + Math.floor(rand() * 1_000_000)) * 1_000_000_000n;
      const safetyMarginTicks = Math.floor(rand() * 5);

      try {
        const r = calibrateTickRange({
          pool: makePoolInfo({ tickSpacing }),
          hint: makeDepthHint({
            tickLower: baseLower,
            tickUpper: baseUpper,
            liquidityDelta: baseLiquidity,
          }),
          intent: makeIntent(),
          options: { safetyMarginTicks },
        });

        if (!Number.isInteger(r.tickLower) || !Number.isInteger(r.tickUpper)) {
          failures.push(`#${i}: non-integer ticks ${JSON.stringify(r)}`);
          continue;
        }
        if (r.tickLower >= r.tickUpper) {
          failures.push(`#${i}: tickLower >= tickUpper ${JSON.stringify(r)}`);
          continue;
        }
        if (
          Math.abs(r.tickLower % tickSpacing) !== 0 ||
          Math.abs(r.tickUpper % tickSpacing) !== 0
        ) {
          failures.push(`#${i}: misaligned ticks (spacing=${tickSpacing}) ${JSON.stringify(r)}`);
          continue;
        }
        if (r.tickLower < MIN_TICK || r.tickUpper > MAX_TICK) {
          failures.push(`#${i}: out of bounds ${JSON.stringify(r)}`);
          continue;
        }
        if (r.liquidityDelta <= 0n) {
          failures.push(`#${i}: non-positive liquidity ${r.liquidityDelta.toString()}`);
          continue;
        }
        // Liquidity cap: never exceeds 10× the base.
        if (r.liquidityDelta > baseLiquidity * 10n) {
          failures.push(
            `#${i}: liquidity exceeded 10× cap (${r.liquidityDelta.toString()} > ${(baseLiquidity * 10n).toString()})`,
          );
          continue;
        }
      } catch (err) {
        // Throws ARE allowed (e.g., extreme corners where capping invalidates
        // the range). What we don't allow: silently producing an invalid
        // output. So we only count successes.
        const msg = err instanceof Error ? err.message : String(err);
        if (
          !msg.includes('cannot widen calibration') &&
          !msg.includes('non-positive')
        ) {
          // Unexpected error class.
          failures.push(`#${i}: unexpected throw ${msg}`);
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });
});

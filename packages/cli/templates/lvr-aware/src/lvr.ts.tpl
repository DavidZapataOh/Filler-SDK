/**
 * LVR (Loss-Versus-Rebalancing) calculator.
 *
 * LVR is the gap between an LP's portfolio if rebalanced continuously (CEX-
 * style) versus held passively in the AMM. For a swap of size X at price P
 * with current liquidity L and implied volatility σ:
 *
 *   LVR ≈ X² × σ² / (8 × L)
 *
 * A JIT fill REDUCES this by absorbing the swap with concentrated liquidity
 * — the same swapper trade clears at a tighter effective price, leaving
 * passive LPs with less adverse selection.
 *
 * **Simplification (v0)**: this implementation uses STATIC volatility from
 * config (`VOLATILITY_BPS`). Production should plug an oracle (Pyth /
 * Chainlink / Redstone realised-vol feed) — wire it in `strategy.ts` and
 * pass to `calculateLVR(intent, params, ctx)` via `ctx.volatilityBps`.
 *
 * **Honest limitation**: the LVR model assumes a single-trade adverse-
 * selection profile, not multi-trade horizon decay. For pools with high
 * fill frequency, the marginal LVR per fill is smaller than the model
 * suggests. Calibration against historical pool data lands in v1.
 */

import type { FillParams, Intent } from '@filler-sdk/sdk';

export interface LVRAnalysis {
  /** Estimated LVR if no JIT, in input-token wei. */
  expectedLVR: bigint;
  /** Reduction the JIT fill provides (proportional to liquidity contribution). */
  expectedReduction: bigint;
  /**
   * "Donation" we'd send back to passive LPs IF the contract path supported
   * it (Plan 04 README documents the on-chain gap). Used for metrics only —
   * the v0 solver does NOT submit a separate donate tx.
   */
  intendedDonationWei: bigint;
}

export interface LVRContext {
  /** Implied volatility in bps (1 bp = 0.01%). 200 = 2% annualised. */
  volatilityBps: number;
  /** Pool's current liquidity (use the indexer's `poolInfo.liquidity`). */
  baseLiquidity: bigint;
  /** Fraction of fees we'd intend to donate, in bps. 2500 = 25%. */
  donationBps: number;
}

const BPS_DENOM = 10_000n;

export function calculateLVR(
  intent: Intent,
  params: FillParams,
  ctx: LVRContext,
): LVRAnalysis {
  const tradeSize = intent.input.amount;
  const liquidity = ctx.baseLiquidity;

  if (liquidity <= 0n) {
    return { expectedLVR: 0n, expectedReduction: 0n, intendedDonationWei: 0n };
  }

  // LVR ≈ tradeSize² × volBps² / (8 × liquidity × 10_000²)
  const volSquared = BigInt(ctx.volatilityBps) * BigInt(ctx.volatilityBps);
  const expectedLVR =
    (tradeSize * tradeSize * volSquared) / (8n * liquidity * BPS_DENOM * BPS_DENOM);

  // The JIT fill reduces LVR proportional to its liquidity contribution.
  const totalLiqAfter = liquidity + params.liquidityDelta;
  const expectedReduction =
    totalLiqAfter > 0n
      ? (expectedLVR * params.liquidityDelta * BPS_DENOM) /
        (totalLiqAfter * BPS_DENOM)
      : 0n;

  // Intended donation = donationBps fraction of the indexer's expected fee.
  const intendedDonationWei =
    (params.feesCaptured * BigInt(ctx.donationBps)) / BPS_DENOM;

  return { expectedLVR, expectedReduction, intendedDonationWei };
}

/**
 * Net solver profit after we'd hypothetically donate `donationBps` of fees.
 * Today the donation is "intended" (metric-only), so net == fees fully kept.
 * Once contract path supports donate-during-callback (see README), this is
 * the line that flips behaviour.
 */
export function netSolverProfit(
  params: FillParams,
  donationBps: number,
): bigint {
  return (params.feesCaptured * (BPS_DENOM - BigInt(donationBps))) / BPS_DENOM;
}

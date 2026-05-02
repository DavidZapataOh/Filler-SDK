/**
 * LVR-aware strategy.
 *
 *   filter(intent)                                — subscribe-time pre-filter (cheap).
 *   decide(intent, params, minProfitWei, ctx)     — async post-prepare gate.
 *
 * Differs from simple-jit's strategy on the `decide` step:
 *
 *   1. Compute LVR analysis (`calculateLVR`).
 *   2. Reject if `expectedReduction === 0n` — JIT doesn't help LPs.
 *   3. Reject if `netSolverProfit(donationBps)` < minProfitWei — even though
 *      v0 keeps the whole fee, the solver author can flip the threshold to
 *      simulate the post-donation world (when contract-side donate ships).
 *   4. Return `{ submit: true, intendedDonationWei }` for metrics emission.
 *
 * The async signature lets you plug oracle calls (volatility / mid-price) at
 * decide-time without restructuring the loop.
 */

import type { FillParams, Intent } from '@filler-sdk/sdk';

import { calculateLVR, type LVRContext, netSolverProfit } from './lvr';

export interface LVRDecision {
  submit: boolean;
  /** What we'd donate if the on-chain path existed. Used for metrics. */
  intendedDonationWei: bigint;
  /** LVR reduction the JIT fill provides — recorded for monitoring. */
  expectedLVRReduction: bigint;
}

export interface LVRStrategy {
  filter(intent: Intent): boolean;
  decide(
    intent: Intent,
    params: FillParams,
    minProfitWei: bigint,
    ctx: LVRContext,
  ): Promise<LVRDecision>;
}

export const strategy: LVRStrategy = {
  filter(_intent: Intent): boolean {
    // LVR check is post-prepare (we need params for it). Accept all here.
    return true;
  },

  async decide(
    intent: Intent,
    params: FillParams,
    minProfitWei: bigint,
    ctx: LVRContext,
  ): Promise<LVRDecision> {
    const lvr = calculateLVR(intent, params, ctx);

    // Gate 1: only fill when LP-favourable.
    if (lvr.expectedReduction === 0n) {
      return {
        submit: false,
        intendedDonationWei: 0n,
        expectedLVRReduction: 0n,
      };
    }

    // Gate 2: profitability AFTER intended donation. Once Filler.sol ships
    // the donate-in-callback path, flip this default — the solver KEEPS only
    // (1 - donationBps/10000) of the captured fee.
    const netProfit = netSolverProfit(params, ctx.donationBps);
    if (netProfit < minProfitWei) {
      return {
        submit: false,
        intendedDonationWei: lvr.intendedDonationWei,
        expectedLVRReduction: lvr.expectedReduction,
      };
    }

    return {
      submit: true,
      intendedDonationWei: lvr.intendedDonationWei,
      expectedLVRReduction: lvr.expectedReduction,
    };
  },
};

/**
 * Strategy — `filter` + `decide` policy hooks.
 *
 *   filter(intent)                 — subscribe-time pre-filter (cheap).
 *   decide(intent, params, minWei) — post-prepare gate (after fill math).
 *
 * Default: accept all + only submit when expected fee >= MIN_PROFIT_USD.
 * Customise both for vertical-specific behaviour (token allowlists,
 * dynamic profit thresholds, oracle-mid-price comparison, etc.).
 */

import type { FillParams, Intent } from '@filler-sdk/sdk';

export interface Strategy {
  filter(intent: Intent): boolean;
  decide(intent: Intent, params: FillParams, minProfitWei: bigint): boolean;
}

export const strategy: Strategy = {
  filter(_intent: Intent): boolean {
    // Add allowlists / dust filters here:
    //   if (!ALLOWED_TOKENS.has(intent.input.token.toLowerCase())) return false;
    //   if (intent.input.amount < DUST_THRESHOLD) return false;
    return true;
  },

  decide(_intent: Intent, params: FillParams, minProfitWei: bigint): boolean {
    return params.feesCaptured >= minProfitWei;
  },
};

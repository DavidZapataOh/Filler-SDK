/**
 * Treasury-rebalance strategy — internalisation primitive.
 *
 *   filter(intent) — accept ONLY intents from the configured TREASURY_ADDRESS.
 *                    Other solvers' opportunities go to other solvers; this
 *                    solver exists to keep the DAO's spread inside the DAO.
 *   decide(intent, params) — always submit. The DAO is paying itself; any
 *                    spread captured stays in the treasury.
 *
 * Customisation: extend `filter` to allow multiple authorised swappers
 * (e.g., DAO + multisig + delegate operator), or `decide` to enforce a
 * minimum spread threshold for very small rebalances.
 */

import type { Address } from 'viem';

import type { FillParams, Intent } from '@filler-sdk/sdk';

export interface TreasuryStrategy {
  filter(intent: Intent): boolean;
  decide(intent: Intent, params: FillParams): boolean;
}

export function createTreasuryStrategy(
  treasuryAddress: Address,
): TreasuryStrategy {
  const target = treasuryAddress.toLowerCase();
  return {
    filter(intent: Intent): boolean {
      return intent.swapper.toLowerCase() === target;
    },
    decide(_intent: Intent, _params: FillParams): boolean {
      // Always submit. The DAO is paying itself — any captured spread stays
      // in the treasury wallet.
      return true;
    },
  };
}

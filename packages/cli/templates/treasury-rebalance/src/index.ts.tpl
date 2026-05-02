/**
 * {{projectName}} — Treasury Rebalance Filler (DAO use case)
 *
 * **NOT YET SHIPPED.** Plan 03 of Sprint 04 lands this template with the
 * full DAO-treasury strategy. Until then this file is a placeholder that
 * compiles cleanly + points users at the docs.
 *
 * **What treasury-rebalance means**: a DAO with a stale token allocation
 * (e.g. 80% USDC, 20% ETH after a year of yield farming) wants to rebalance
 * back to a target ratio. Filling its own intents at fair (Uniswap-mid)
 * price internalises the rebalance — the DAO captures the spread instead of
 * paying it to an external solver. This vertical's solver wraps Filler SDK
 * + adds a treasury-aware filter that only fires for orders signed by the
 * configured DAO multisig.
 *
 * Track this template's progress: https://github.com/filler-sdk/filler-sdk
 */

console.warn(
  '[{{projectName}}] treasury-rebalance vertical scaffolded; real strategy lands in Sprint 04 Plan 03.',
);
console.warn(
  '[{{projectName}}] For a working starter today, regenerate with `--vertical simple-jit`.',
);

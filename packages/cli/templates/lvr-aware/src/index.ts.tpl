/**
 * {{projectName}} — LVR-Aware Filler (advanced)
 *
 * **NOT YET SHIPPED.** Plan 03 of Sprint 04 lands this template with the
 * full LVR-aware strategy. Until then this file is a placeholder that
 * compiles cleanly + points users at the docs.
 *
 * **What LVR-aware means**: Loss-Versus-Rebalancing — the LP's adverse-
 * selection cost. This vertical's solver only fills when the post-fill
 * pool state minimises LVR (i.e., the swap moves the price toward
 * external-CEX consensus, not away from it). For most pairs that means
 * checking against a Pyth/Chainlink mid-price + only filling when the
 * UniswapX price is on the LVR-favorable side.
 *
 * Track this template's progress: https://github.com/filler-sdk/filler-sdk
 */

console.warn(
  '[{{projectName}}] LVR-aware vertical scaffolded; real strategy lands in Sprint 04 Plan 03.',
);
console.warn(
  '[{{projectName}}] For a working starter today, regenerate with `--vertical simple-jit`.',
);

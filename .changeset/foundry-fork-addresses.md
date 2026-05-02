---
'@filler-sdk/sdk': patch
---

Foundry chain (31337) entry now ships with mainnet-fork-aware default addresses.

`getChainById(31337)` and `getChainByName('foundry')` previously returned
placeholder addresses (`0x0000…dEaD`) for `poolManager` / `reactor` / `filler`
/ `fillerBond`. With Sprint 5.5 Plan 02's deploy against an anvil mainnet
fork, the canonical addresses are now committed:

- `poolManager`: `0x000000000004444c5dc75cb358380d2e3de08a90` (mainnet v4 PoolManager,
  inherited from fork state)
- `reactor`: `0x00000011f84b9aa48e5f8aa8b9897600006289be` (mainnet UniswapX V2
  DutchOrderReactor, inherited from fork state — owner verified as Uniswap
  Timelock Multisig)
- `filler`: `0xC489d11D03B2999A6ba568e02E0b95eFc58b6A34` (deterministic CREATE
  output from anvil deployer key, nonce 1)
- `fillerBond`: `0x559Bb2F2beb43246bA63057F3750b742b92dBBf9` (deterministic
  CREATE output from anvil deployer key, nonce 0)

This matches `contracts/deployments/31337.json` written by `Deploy.s.sol`.

Operators running pure local anvil (no fork) MUST still override these via
`getDeployedAddresses(chain, overrides)` — there's nothing at those addresses
on a fresh anvil. The defaults assume the standard Sprint 5.5 fork-mode
recipe.

Background: Sprint 5.5 Plan 01 audited testnet UniswapX coverage and found
ZERO testnet deployments (logged as F-57). The pivot is: mainnet fork is
the primary E2E path. See `plans/sprint-05.5-testnet-e2e/decisions.md`.

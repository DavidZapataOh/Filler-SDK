# Deployment artifacts

Files in this directory are written by `script/Deploy.s.sol` (see `Deploy.s.sol`'s `_writeDeployment`). Each successful deployment produces `<chainId>.json` with the schema below.

Files are committed alongside the deploy PR so downstream tooling — SDK, CLI, dashboard — can read addresses directly from the repo without RPC lookups.

## Schema

```json
{
  "chainId": 11155111,
  "filler": "0x...",
  "bond": "0x...",
  "poolManager": "0x...",
  "reactor": "0x...",
  "treasury": "0x...",
  "owner": "0x...",
  "deployedAt": 1746123456,
  "deployedBlock": 4567890
}
```

## Consumers

- **`@filler-sdk/sdk`** (Sprint 03) — `getDeployment(chainId)` reads from this directory at build time
- **`create-filler` CLI** (Sprint 04) — generates `.env` snippets from the chainId the user picks
- **`apps/dashboard`** (Sprint 05) — references addresses for explorer links

## Idempotency

Before each deploy, run `scripts/check-deployment.sh <rpc-alias>`. The script:

1. Resolves chain ID via `cast chain-id --rpc-url <alias>`
2. Checks if `deployments/<chainId>.json` exists with non-empty `filler` + `bond`
3. Verifies the recorded addresses still hold bytecode on-chain
4. Exits 0 (skip deploy) if everything matches; exits 1 (proceed) otherwise

## Operator runbook

See [`docs/deployment/README.md`](../../docs/deployment/README.md) for the full deploy + multisig handover steps.

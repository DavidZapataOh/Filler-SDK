# Deployment runbook

Step-by-step guide for deploying `Filler.sol` + `FillerBond.sol` to a new chain. Every step is reproducible from a fresh clone of the repo.

## Prerequisites

| Requirement | Notes |
|---|---|
| Foundry installed | `foundryup` (matches Sprint 00 toolchain pin) |
| RPC URL for the target chain | Set as `${CHAIN}_RPC_URL` env var |
| Etherscan API key (only for Etherscan-family chains) | `ETHERSCAN_API_KEY` |
| Hot-wallet deployer key with gas funds | `DEPLOYER_KEY` — see "Deployer key hygiene" below |
| Multisig (Safe) deployed on the target chain | Owner of Filler + Bond after handover |
| Treasury multisig (separate from owner) | Recipient of slashed funds |
| `jq`, `cast` for the idempotency check | macOS: `brew install jq` |

## 1. Decide the addresses upfront

Before running any script, write down these addresses. Two of them MUST be different multisigs:

| Slot | Recommended source |
|---|---|
| `POOL_MANAGER` | Canonical Uniswap v4 PoolManager for the chain. Pin the address from [Uniswap docs](https://docs.uniswap.org/contracts/v4/deployments). |
| `UNISWAPX_REACTOR` | UniswapX V2DutchOrderReactor (or chain-equivalent). Pin from UniswapX docs. |
| `BOND_TREASURY` | A Safe distinct from the owner multisig. Receives slashed ETH. |
| `MULTISIG_OWNER` | A Safe with 2/3 (testnet) or 3/5 (mainnet) threshold. Owns Filler + Bond. |
| `DEPLOYER_KEY` | Ephemeral hot wallet. Fund with just enough ETH for the deploy + handover. |

The deploy script asserts `BOND_TREASURY != MULTISIG_OWNER` — a separate-multisig discipline (see ADR 0002).

## 2. Idempotency check

```bash
cd contracts
./scripts/check-deployment.sh sepolia
```

If the script exits 0, a deployment already exists for this chain and is verified on-chain. Skip step 3.

If it exits 1, proceed.

## 3. Deploy

```bash
# Load env. Each chain has its own .env file (gitignored).
source .env.sepolia

forge script script/DeploySepolia.s.sol \
  --rpc-url sepolia \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  -vvv
```

For Unichain Sepolia, switch to Sourcify:

```bash
source .env.unichain-sepolia

forge script script/DeployUnichainSepolia.s.sol \
  --rpc-url unichain_sepolia \
  --broadcast \
  --verify \
  --verifier sourcify \
  -vvv
```

The script:
1. Deploys `FillerBond` (constructor: treasury + reactor)
2. Deploys `Filler` (constructor: reactor + poolManager + bond)
3. Atomically transfers ownership of BOTH contracts to `MULTISIG_OWNER`
4. Writes `deployments/<chainId>.json`
5. Prints a summary block

If `--verify` fails (Etherscan rate limit, transient API error), retry with the manual verification command from `script/ConfigureApprovals.s.sol`'s comments — bytecode is reproducible because `bytecode_hash = "none"` and `cbor_metadata = false` are pinned in `foundry.toml`.

## 4. Verify ownership on-chain

```bash
cast call $FILLER "owner()(address)" --rpc-url sepolia
cast call $BOND   "owner()(address)" --rpc-url sepolia
```

Both must equal `MULTISIG_OWNER`. If anything else, **do not proceed** — the deploy is broken.

## 5. Multisig configures approvals

This is a separate transaction submitted by the multisig. Generate the calldata:

```bash
FILLER_ADDRESS=$FILLER \
WHITELIST_CURRENCIES="0x0000000000000000000000000000000000000000,0x...USDC,0x...WETH" \
forge script script/ConfigureApprovals.s.sol -vvv
```

The script logs:
- `to`: the Filler address
- `value`: `0`
- `data`: ABI-encoded `configureApprovals(currencies)`

Paste those into Safe Transaction Builder. Threshold signatures sign + execute.

**`configureApprovals` is one-shot** — the contract's `approvalsAlreadySetup` flag prevents re-running. New currencies post-setup go through `allowCurrency(c)` (also multisig-only).

## 6. Verify approvals

```bash
cast call $FILLER "allowedCurrencies(address)(bool)" $USDC --rpc-url sepolia
cast call $FILLER "allowedCurrencies(address)(bool)" $WETH --rpc-url sepolia
```

Both must return `true`.

## 7. Commit deployment artifact + tag release

```bash
git add deployments/<chainId>.json
git commit -m "deploy: contracts to chain <chainId>"
git tag v0.1.0-contracts-<chain>
git push origin main --tags
```

The release workflow detects the tag and publishes a GitHub release with the deployment metadata.

## Deployer key hygiene

The `DEPLOYER_KEY` env var holds a private key. Discipline:

1. **Ephemeral** — generate a fresh key for each deploy (`cast wallet new`). Never reuse across chains.
2. **Minimal funding** — fund with just enough ETH for ~2 deploys' gas (~0.05 ETH on most chains is plenty).
3. **Atomic handover** — the script transfers ownership in the same broadcast as the deploy. After the script returns, the deployer key has zero contractual privilege.
4. **Discard post-deploy** — once the deployment artifact is committed, consider the key spent. Burn it.

NEVER use the deployer key to call `configureApprovals` — that's the multisig's job. The script doesn't do it for you, but the temptation is real; resist.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `POOL_MANAGER must be non-zero` | env var missing | Confirm `.env.<chain>` was sourced, addresses are 0x-prefixed |
| `BOND_TREASURY must be a separate address from MULTISIG_OWNER` | Both env vars point to the same Safe | Pick distinct multisigs — slashes go to one, governance owns the other |
| Tx reverts on `transferOwnership` | Solady's `_initializeOwner` was called with a non-msg.sender owner | Should not happen with our constructor; if it does, file an issue |
| `--verify` times out | Etherscan API throttle | Re-run `forge verify-contract` manually with the exact constructor args; or fall back to Sourcify |
| Idempotency script reports stale record | Old artifact for a redeploy | Delete `deployments/<chainId>.json` after confirming you really want to redeploy |

## Related

- [`docs/deployment/multisig.md`](./multisig.md) — Safe setup checklist (signers, threshold, recovery)
- [`docs/security/formal-verification.md`](../security/formal-verification.md) — what's formally proven about the deployed contracts
- [`docs/adr/0001-immutable-contracts.md`](../adr/0001-immutable-contracts.md) — why we don't ship a proxy
- [`docs/adr/0002-bond-v0-owner-slash.md`](../adr/0002-bond-v0-owner-slash.md) — the v0 trust assumptions

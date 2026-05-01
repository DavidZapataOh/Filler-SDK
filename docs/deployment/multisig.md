# Multisig setup

`Filler.sol` and `FillerBond.sol` rely on two distinct multisigs:

| Role | Owns / receives | Threshold |
|---|---|---|
| **`MULTISIG_OWNER`** | Owns Filler + Bond. Can call `configureApprovals`, `allowCurrency`, `disallowCurrency`, `slash`, `setTreasury`, `transferOwnership`. | 2/3 testnet, 3/5 mainnet |
| **`BOND_TREASURY`** | Receives slashed ETH. No contractual privilege beyond holding ETH. | 2/3 testnet, 2/4 mainnet |

The deploy script enforces `MULTISIG_OWNER != BOND_TREASURY`. A common operator mistake is using the same Safe for both — the resulting trust model is "the slasher slashes itself," which collapses the accountability story (see ADR 0002 §3 "Treasury == owner foot-gun").

## Recommended Safe setup

### Owner multisig (`MULTISIG_OWNER`)

| Property | Recommendation |
|---|---|
| Signers | At least 2 distinct EOAs from different team members + 1 hardware-wallet signer |
| Threshold | Mainnet: ⌈2/3 of signers⌉. Testnet: 2/3 minimum. |
| Recovery | Document the seed-phrase storage policy out-of-band |
| EIP-1271 | Yes — enables onchain signature verification for any future automation |

### Treasury multisig (`BOND_TREASURY`)

| Property | Recommendation |
|---|---|
| Signers | A separate group from the owner multisig. Treasury and owner shouldn't share more than 1 signer in common. |
| Threshold | 2/4 keeps the operator manageable while ensuring no single signer can drain |
| Spend policy | Document who can authorize a payout from treasury (e.g., compensating slashed but legitimate fillers) |

## Step-by-step (Safe v1.4.x)

1. Go to `https://app.safe.global/<network>/welcome`
2. Click **Create new Safe**
3. Connect a deployer wallet (NOT the same key as `DEPLOYER_KEY` — use a longer-lived key)
4. Add owner addresses. **At least 2 owners must come from different team members on different machines.**
5. Set the threshold per the table above.
6. Pay the deploy gas. Note the resulting Safe address — this is your `MULTISIG_OWNER` value.
7. Repeat for the treasury Safe with different owners.
8. Test: send 0.01 ETH to the Safe. Submit a withdraw of 0.005 ETH. Confirm threshold signatures collect + execute. Document the signing flow internally.

## Documenting the signers

Keep a private internal doc with:

- Safe addresses (`MULTISIG_OWNER`, `BOND_TREASURY`) per chain
- Per-Safe: signer-address → real-name (where the seed is stored)
- Recovery procedure if a signer goes offline (typically: rotate via Safe's "Replace owner" flow)
- Key-rotation cadence (recommended: annual, or after any operator team change)

The public repo MUST NOT contain signer-to-person mappings, only the Safe addresses themselves (which are public anyway via `deployments/<chainId>.json`).

## Cross-references

- [`docs/deployment/README.md`](./README.md) — runbook
- [`docs/adr/0002-bond-v0-owner-slash.md`](../adr/0002-bond-v0-owner-slash.md) — why slash + treasury are separated
- [`script/ConfigureApprovals.s.sol`](../../contracts/script/ConfigureApprovals.s.sol) — calldata generator the Safe consumes

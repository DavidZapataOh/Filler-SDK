# ADR 0002 — Bond v0: Owner-Controlled Slash with Evidence Hash

## Status

Accepted

## Date

2026-04-30

## Context

`FillerBond.sol` is the accountability primitive of the SDK. Stakers post ETH bond against a specific filler. If the filler commits a slashable violation (e.g. `Reactor.Filled` event followed by no token delivery to the swapper), some authority must slash the bond.

The honest version of this question — "who decides what counts as a violation, and how is that decision verified?" — has three plausible answers:

1. **Owner-controlled slash** with off-chain evidence hash.
2. **Trustless slash via Reactor event proof** — provide block header + receipts trie inclusion proof of the violating event.
3. **Optimistic dispute window** — anyone can claim a slash with a deposit; slash executes after a challenge period if no dispute.

Constraints driving the v0 choice:

- **Hackathon timeline** (ETHGlobal OpenAgents, ~10 days end-to-end): trustless slashing requires an EVM block-header verifier, receipts-trie merkle decoding, and event-log ABI decoding. That is multiple sprints of work and a sizeable audit surface, with no existing Solidity library we can drop in.
- **Audit surface**: option 2's cryptographic plumbing (RLP decoding, MPT verification, signature recovery against the canonical chain) historically introduces serious bugs (e.g. multiple Lido/zkBridge issues in 2023–2024).
- **Trust model already documented in [ADR 0001](./0001-immutable-contracts.md)**: customers operate under a "self-custodial" framing — they deploy their own filler + bond. The natural slashing authority for *that* deployment is the same multisig that owns the bond contract. Cross-customer slashing is out of scope for v0.
- **Pre-mainnet status**: no live funds at risk. Bonds are testnet-grade until at least Q3 2026.

## Decision

**v0 ships option 1: owner-controlled slash with `bytes32 evidenceHash` commitment.**

The owner (multisig) calls `slash(filler, amount, evidenceHash)`. The contract enforces:

- `evidenceHash` has not been used before (`AlreadySlashed` revert).
- `amount > 0` (`ZeroStake` revert).
- `amount <= totalStakedFor[filler]` (`NotEnoughStake` revert).
- Slash is recorded; ETH is sent to the configured `treasury`.

The contract does **NOT**:

- Verify the evidence on-chain.
- Decode any Reactor event format.
- Allow slashing of cooldown amounts (`unstakeAmount` is not touched).

`evidenceHash` is a publicly committable hash that off-chain observers can correlate with the actual event log (typically `keccak256(rlpEncode(reactorEventLog))`). This gives the slash a tamper-evident anchor without requiring on-chain verification.

## Alternatives considered

### Trustless slash via event proof (option 2)

- **Pros**: No trust in owner. Anyone can slash with a valid proof.
- **Cons**: Significant Solidity LOC (block header verification, MPT proofs, RLP decoding, log decoding). Audit cost is non-trivial. A bug in the verifier permanently breaks slashing or — worse — allows fake slashes.
- **Why rejected for v0**: not feasible within hackathon timeline. Logged as v1 roadmap in NatSpec.

### Optimistic slash with challenge period (option 3)

- **Pros**: Sweet spot between trust and complexity. Anyone can propose a slash; owner / DAO can dispute within N days.
- **Cons**: Requires a separate dispute resolution mechanism (kleros-style, owner veto, etc.). Adds two new state machines (proposed-slash, disputed-slash). Real implementation usually grows to a Mode-style oracle or KlerosCourt integration — more complexity than option 2.
- **Why rejected for v0**: extra moving parts; not aligned with the hackathon scope.

## Consequences

### Positive

- Implementation is straightforward and reviewable in a single sitting (~80 LOC of slash-related code).
- `evidenceHash` provides the same tamper-evidence guarantee as a full proof, given that the off-chain log is also publicly visible on-chain.
- The trust assumption is bounded: owner can only slash *active* stake, never cooldown amounts, never above the active balance.
- Upgrade path to v1 is clean — `slashWithProof(...)` can be added as a new function alongside `slash(...)` without touching existing storage or behavior.

### Negative

- Owner is trusted not to slash without justification. A malicious / compromised owner can drain the active stake of any filler to the treasury.
- If owner is the same multisig that controls the treasury, a slash → treasury → owner round-trip is theoretically possible.
- Stakers cannot independently verify the evidence on-chain; they must trust either the owner or off-chain auditors who correlate `evidenceHash` with public Reactor logs.

### Risks accepted

- **Owner key compromise** drains all active stake to treasury. Mitigation: treasury must be a multisig; owner should also be a multisig (deploy script verification).
- **Stakers race a slash** by front-running with `requestUnstake` — once requested, the cooldown amount is no longer slashable. This is a v0 simplification; v1 with virtual shares closes it.
- **Pro-rata accounting drift** — individual `stakes[filler][staker].amount` is NOT decremented during slash, only the pool-level `totalStakedFor[filler]`. Stakers see their own balance unchanged but `requestUnstake` underflows beyond the post-slash pool size. Documented in NatSpec.
- **Treasury == owner foot-gun** — deploy script must check that `treasury` is a separate multisig from the bond owner. Not enforced on-chain.

### Operational scope

- Owner **CAN**: call `slash(filler, amount, evidenceHash)`, call `setTreasury(newTreasury)`, transfer ownership.
- Owner **CANNOT**: change `REACTOR` (immutable), shorten `UNSTAKE_COOLDOWN` (constant), reach into pending withdrawals, freeze stakers, halt new stakes.
- Stakers **CAN**: stake any positive amount, request to unstake any portion, withdraw after 7-day cooldown.
- Stakers **CANNOT**: withdraw before cooldown, prevent slashing of their active stake during cooldown setup, recover slashed amounts.

## References

- [`contracts/src/FillerBond.sol`](../../contracts/src/FillerBond.sol)
- [`plans/sprint-01-smart-contracts/02-filler-bond-contract.md`](../../plans/sprint-01-smart-contracts/02-filler-bond-contract.md)
- [ADR 0001 — Immutable contracts](./0001-immutable-contracts.md)
- Trustless slash references for v1:
  - [Lido CSM proof verification](https://github.com/lidofinance/community-staking-module) (similar receipt-trie inclusion pattern)
  - [Telepathy block header verification](https://github.com/succinctlabs/telepathy-contracts)

## Revisit triggers

- Before mainnet deployment with non-trivial TVL ($100k+).
- After v1 trustless-slash design is audit-ready (target: Q3 2026 alongside Spearbit/ToB engagement).
- If a slash incident exposes a gap in the evidence-hash commitment scheme.
- If a community filler operator (i.e. third-party deployment) pushes back on the owner-trust requirement.

# ADR 0001 — Immutable Contracts (No Proxy)

## Status

Accepted

## Date

2026-05-01

## Context

Filler SDK ships smart contracts (`Filler.sol`, `FillerBond.sol`) that handle user intent fills + bonded stake. We must decide:

1. Upgradeable via proxy (transparent or UUPS)?
2. Diamond pattern (EIP-2535)?
3. Immutable, deploy new versions and migrate?

Constraints:

- **Trust model**: customers (DAOs, vault products, research teams) delegating execution to us must be able to verify the code that handles their funds. Any upgradeability is a trust assumption that the upgrade authority is honest.
- **Audit cost**: proxy patterns add ~30% audit surface (storage layout, initialization, admin functions, delegatecall safety).
- **Gas cost**: every external call through a proxy pays ~2,100 extra gas for `DELEGATECALL`. Filler.sol's `reactorCallback` budget is 600k — proxy adds ~0.35% overhead which would compound across the JIT pattern's nested calls.
- **Ecosystem signal**: Tycho ($500K UF grant) ships immutable infrastructure. UniswapX Reactor itself is immutable per release. UF's grant pattern is "infra you can trust without trusting us."
- **Scope**: pre-mainnet, single customer deployment per chain. We are not a SaaS — every customer can deploy their own copy if they prefer (see `PROYECTO_OPENSOLVER.md` § Topology).

## Decision

**Contracts are immutable. No proxy pattern in v0.**

Future versions will be deployed as new contracts with explicit migration scripts. Old contracts remain operational for users who don't migrate. Owner (multisig) has limited *operational* powers (currency whitelist management, treasury address, approval setup) but **cannot** modify fill logic, slashing logic, or move user funds.

## Alternatives considered

### Transparent Proxy (OpenZeppelin)

- **Pros**: Easy upgrades, common pattern, well-audited library
- **Cons**: Storage slot collisions are easy to introduce, owner trust assumption is significant, attack surface for the admin functions, gas overhead per call
- **Why rejected**: trust assumption violates the self-custodial framing in `PROYECTO_OPENSOLVER.md`. We tell customers "your treasury is the operator" — that's incompatible with "but we can swap out the code anytime."

### UUPS Proxy (OpenZeppelin)

- **Pros**: Lower gas than transparent (~1k savings), OZ-supported, smaller admin surface
- **Cons**: Same trust + complexity issues. The upgrade function lives in the implementation, so a buggy upgrade can permanently break the contract (see ParaSwap incident, 2022)
- **Why rejected**: same trust concerns; the "buggy upgrade bricks contract" foot-gun is unacceptable for funds-handling contracts

### Diamond Pattern (EIP-2535)

- **Pros**: Modular upgrades, can swap individual facets without redeploying everything
- **Cons**: Massive complexity; auditors charge significant premiums; not battle-tested for our use case (most diamond deployments are NFT projects); function selector collisions are real concern
- **Why rejected**: scope-creep — we have at most 2 contracts. Diamond is overkill. Audit cost would dominate Sprint 01 budget.

### Beacon Proxy

- **Pros**: Centralized upgrade across multiple instances
- **Cons**: We don't have a multi-instance use case (no factory pattern in v0)
- **Why rejected**: solves a problem we don't have

## Consequences

### Positive

- **Eliminates proxy attack surface** — no delegatecall, no storage collisions, no upgradeability admin
- **Reduces audit scope significantly** — auditors only review business logic, not upgrade machinery
- **Trust-minimized** — customers know contract code can't change after deploy. Verifiable on Etherscan/Sourcify.
- **Aligns with self-custodial framing** in PROYECTO_OPENSOLVER.md
- **~2,100 gas saved per call** (no DELEGATECALL)
- **Tycho-shape** — Tycho contracts are immutable. Ecosystem alignment with UF-funded infra.

### Negative

- **Bug fixes require new deploy + migration** — coordination cost, customer education
- **Cannot adjust parameters post-deploy** beyond the operational scope below
- **Customers must redeploy filler if they want new features** — though most don't (vertical solvers are typically deployed once and run)

### Operational scope

The owner (multisig) **CAN**:

- `configureApprovals(currencies)` — one-time at deploy, sets max approval to PoolManager + Reactor for whitelisted tokens
- `allowCurrency(c)` / `disallowCurrency(c)` — operational whitelist of tradeable tokens
- `setTreasury(addr)` — recipient of slashed funds in `FillerBond.sol`
- (Bond v0 only) `slash(filler, amount, evidence)` — submit evidence hash to slash a bonded filler

The owner **CANNOT**:

- Modify fill logic (no upgradeability)
- Move user funds outside the fill flow
- Bypass bond cooldown
- Slash arbitrarily without an evidence hash
- Add `delegatecall` paths
- Self-destruct contracts

### Risks accepted

- **Bug discovered post-mainnet** → must coordinate migration. Mitigation: extensive pre-mainnet audit (Trail of Bits / Spearbit, Sprint 01 roadmap), formal verification (Halmos), 1M+ Echidna runs, fork tests.
- **Migration UX is non-trivial** — documented in `plans/sprint-01-smart-contracts/02-filler-bond-contract.md` § v1 roadmap.
- **Parameter changes require new deploy** — accepted; the operational scope above covers everything we expect to change at runtime.

## References

- PR: (to be linked when this ADR's PR merges)
- [`PROYECTO_OPENSOLVER.md`](../../../PROYECTO_OPENSOLVER.md) § 19 Decisiones explícitas tomadas (decision #6: "Un solo contrato con dos callbacks anidados, no orquestador intermedio" — adjacent reasoning)
- [`plans/PRINCIPLES.md`](../../../plans/PRINCIPLES.md) § 1 Security first (no upgradeable contracts in v0)
- Trail of Bits, ["Use of Proxies in Smart Contracts"](https://blog.trailofbits.com/2018/09/05/contract-upgrade-anti-patterns/), 2018 (still relevant)
- a16z, ["An Engineer's Guide to Upgradeable Smart Contracts"](https://a16zcrypto.com/posts/article/an-engineers-guide-to-upgradeable-smart-contracts/), 2022
- ParaSwap upgrade incident, 2022 (UUPS bricking)

## Revisit triggers

Reconsider this decision if:

- After **6 months of mainnet operation**, we observe a pattern of needed parameter changes that exceeds the operational scope above
- A critical security issue requires faster response than redeploy + migration allows (current plan: hot-patch via new deploy + customer notification)
- Ecosystem standards shift — e.g., Tycho-style contracts adopt limited upgradeability for governance features
- Customer feedback explicitly identifies redeploy friction as a top blocker

If revisited: open a successor ADR (e.g., `0050-limited-upgradeability.md`) and mark this ADR as `Superseded by`.

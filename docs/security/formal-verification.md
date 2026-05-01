# Formal Verification — scope, results, and limitations

> Honest disclosure of what `halmos` proves about Filler SDK contracts and what it does NOT.

## What "formal verification" means here

We use [Halmos](https://github.com/a16z/halmos) — symbolic execution over Solidity tests. For every input that satisfies the test's `vm.assume` preconditions, Halmos uses an SMT solver to prove that the assertion holds. This is *bounded* symbolic execution: deterministic for pure logic + access control, but doesn't replace a full formal-methods engagement.

A `[PASS]` from Halmos means: **for every input in the symbolic input space (after assumptions), every path explored ended with the assertion holding**. Subject to the limitations below.

## What we prove

### `Filler.sol` — `HalmosFillerAccess`

| Property | Halmos check |
|---|---|
| Only `REACTOR` can call `reactorCallback` | `check_reactorCallback_revertsForEveryNonReactor` |
| Only `POOL_MANAGER` can call `unlockCallback` | `check_unlockCallback_revertsForEveryNonPoolManager` |
| Only owner can call `configureApprovals` | `check_configureApprovals_revertsForEveryNonOwner` |
| Only owner can call `allowCurrency` | `check_allowCurrency_revertsForEveryNonOwner` |
| Only owner can call `disallowCurrency` | `check_disallowCurrency_revertsForEveryNonOwner` |
| Constructor stores immutables correctly | `check_constructorState_isCorrect` |

All 6 pass with paths in `[1, 3]` and total wall-clock under 1s.

### `FillerBond.sol` — `HalmosBondInvariants`

| Property | Halmos check |
|---|---|
| `bond.balance >= totalStaked` after a stake | `check_solvency_holds_after_stake` |
| `withdraw` always reverts before cooldown elapses (∀ time < 7 days) | `check_withdraw_revertsBeforeCooldown` |
| `slash` with a previously-used evidence hash always reverts `AlreadySlashed` | `check_slash_doublespend_blocked` |
| `withdraw` without a pending request reverts `NoUnstakeRequest` | `check_withdraw_revertsWithoutRequest` |
| **F-2 fix**: post-multi-staker-slash, `requestUnstake` reverts cleanly with `NotEnoughStake` (no panic) | `check_F2_requestUnstake_revertsCleanlyAfterSlash` |
| Direct ETH transfer always reverts `DirectETHRejected` | `check_directETH_alwaysReverts` |

All 6 pass with paths in `[3, 18]` and total wall-clock around 5s.

The F-2 check is the most consequential — it formally proves that the defensive cap shipped in Plan 06 closes the multi-staker-slash panic identified by Plan 05's invariant suite.

## What we deliberately do NOT prove with Halmos

### Atomic-JIT delta settlement (`_assertDeltasZero`)

Plan 07 §3.2 originally specced a Halmos check that "after `unlockCallback`, both currency deltas are zero." We do not ship this check.

**Why not**: the property requires Halmos to symbolically reason across:
1. The Filler's calls into a `PoolManager` mock that itself manipulates transient storage,
2. ERC20 token transfers via `Currency.transfer` (low-level `call` to symbolic addresses),
3. The post-call read of `currencyDelta` via `exttload` against the same mock.

Halmos cannot meaningfully resolve symbolic external calls into opaque mock contracts. We tried; Halmos either finds spurious counter-examples that depend on the mock's implementation choices, or times out.

**What we have instead**:
- **Plan 04 unit tests** (`Filler.t.sol`): `test_reactorCallback_singleFill_*` and `test_reactorCallback_multiFillBatch_*` verify the call shape against a deterministic `MockPoolManager`.
- **Plan 05 invariant suite** (`FillerInvariants.t.sol`): `invariant_currencyDeltasZero` exercises 16,384 fuzzed sequences against a stateful mock. After every successful fill, both deltas are zero.
- **Plan 06 Slither**: 0 medium / 0 high findings on the v4 integration paths.
- **Sprint 02 fork tests**: against the live mainnet PoolManager (real transient storage), the same property is exercised end-to-end.

The four pillars together cover the property at *engineering* rigor; full formal verification of delta settlement is on the audit-prep roadmap (Halmos config or a Certora prover spec) before mainnet.

## Halmos limitations honestly disclosed

These are the framework's limitations, not bugs in our checks:

1. **Bounded loops**: `--loop 4` (in `halmos.toml`) caps loop unrolling. Our checks have no unbounded loops; the access-control modifier checks have zero loops; the bond checks have at most one user action per check.
2. **External calls into symbolic addresses**: Halmos abstracts these as fully unconstrained (any return value possible). Our checks AVOID this surface — the access tests don't perform external calls beyond the modifier itself; the bond tests stay within the bond's own ETH accounting.
3. **Solver timeout**: `--solver-timeout-assertion 60000ms` (60s) per assertion. If a check times out, it shows `[TIMEOUT]` not `[PASS]`. **We never widen `vm.assume` to silence a timeout** — we either simplify the check or accept it's outside Halmos's tractable space.
4. **AST requirement**: Halmos parses Foundry's build-info JSON; the `forge build --build-info` flag is mandatory. CI workflow includes it; local development needs it too.

## CI integration

`.github/workflows/halmos.yml` runs both contract suites on every PR that touches `contracts/src/**`, `contracts/test/halmos/**`, or `contracts/halmos.toml`, plus a Monday cron. Failures block merge.

## Reproducing locally

```bash
cd contracts
forge build --build-info     # AST-emitting build
halmos --contract HalmosFillerAccess
halmos --contract HalmosBondInvariants
```

Expected: 12 / 12 pass in ~6s on a modern laptop.

## When to escalate beyond Halmos

Any of these conditions should trigger a paid formal verification engagement (Certora, Runtime Verification, OtterSec):

- TVL exceeds $1M.
- A new property is identified that Halmos can't tractably prove.
- A v1 redesign (e.g., virtual-shares bond) introduces new state-machine complexity.
- Pre-mainnet audit close requires it.

## Audit trail

| Date | Halmos version | Suites | Result |
|---|---|---|---|
| 2026-04-30 | 0.3.3 | `HalmosFillerAccess`, `HalmosBondInvariants` | 12 / 12 pass |

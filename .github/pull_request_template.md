<!--
Thanks for contributing to Filler SDK! Please fill out the sections below.
For routine docs/CI/chore changes, you may delete sections that don't apply.
-->

## Summary

<!-- 1-3 lines: what does this PR do, and why -->

## Plan reference

<!-- Link to plans/*.md if implementing a tracked plan -->

Implements: `plans/sprint-XX/YY-name.md`

## Acceptance criteria

<!-- Copy from the plan's Acceptance criteria section, mark what's done -->

- [ ] ...

## Security checklist (contracts only — delete for non-contract PRs)

<!-- Copy relevant items from plans/sprint-01-smart-contracts/security-checklist.md -->

- [ ] CEI pattern verified in any function that touches tokens
- [ ] Reentrancy guards in place (transient storage)
- [ ] Custom errors only (no require strings)
- [ ] Slither clean (0 medium+) — see CI gate
- [ ] No `tx.origin` for auth
- [ ] No `delegatecall` to user-supplied addresses
- [ ] External calls last in function (CEI)

## Test plan

<!-- How was this tested? -->

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual verification (describe)

## Performance impact

<!-- Gas snapshot diff for contracts (CI will comment automatically). Bundle size diff for TS packages. -->

## Documentation

<!-- Updated docs? Linked? -->

- [ ] Public API has TSDoc / NatSpec
- [ ] Concepts/recipe page updated if behavior changes
- [ ] ADR added if architectural change (`docs/adr/`)

## Changeset

<!-- For changes that affect packages/* — add a changeset: `bun changeset` -->

- [ ] Changeset added (or `[skip changeset]` justified)

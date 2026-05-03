# Contributing to Filler SDK

Thanks for considering contributing! This document covers local setup, conventions, and the PR workflow.

## Quick links

- [Engineering principles](../plans/PRINCIPLES.md)
- [Source-of-truth project spec](../PROYECTO_OPENSOLVER.md)
- [Implementation plans](../plans/README.md)
- [Security policy](./SECURITY.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)

## Development setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1.30
- [Node.js](https://nodejs.org) ≥ 20 (we test on 20 and 22)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) ≥ 1.5 (forge, cast, anvil)
- Git with submodule support

### Initial setup

```bash
git clone https://github.com/DavidZapataOh/filler-sdk.git
cd filler-sdk
bun install

# Install Foundry deps (pinned commits — see contracts/scripts/install-deps.sh)
cd contracts && bash scripts/install-deps.sh && cd ..

# Verify everything works
bun run lint
bun run typecheck
bun run build
bun run test
bun run validate:contracts
```

If any step fails on a clean clone, **that is a bug** — please open an issue.

## Project structure

See [`plans/README.md`](../plans/README.md) for the full repo layout. Key directories:

- `packages/` — npm-publishable: `@filler-sdk/sdk`, `@filler-sdk/jit-hints`, `create-filler`
- `contracts/` — Solidity (Foundry project) — `Filler.sol`, `FillerBond.sol` + libs + tests
- `examples/` — reference solver implementations (Sprint 04)
- `apps/` — `apps/dashboard` (demo) + `apps/docs` (Vocs site) (Sprints 05–06)
- `.github/` — workflows, dependabot, issue/PR templates

## Making changes

### Branching

Branch off `main` with descriptive names:

- `feat/<sprint>-<short-name>` — new feature implementing a plan
- `fix/<short-description>` — bug fix
- `docs/<area>` — docs-only changes
- `chore/<task>` — maintenance / dependency bumps

### Conventional commits

We use [Conventional Commits](https://www.conventionalcommits.org). Examples:

```
feat(sdk): add intent stream subscription
fix(contracts): correct delta settlement order
docs(readme): polish quickstart
chore(deps): bump viem to 2.21
```

CI will not enforce this strictly during pre-1.0 — please follow the convention anyway so the changelog reads cleanly.

### Changesets

If your PR changes anything under `packages/*`, **add a changeset**:

```bash
bun changeset
```

Pick affected packages → bump type (patch / minor / major) → write a summary. Commit the generated `.changeset/<name>.md` file.

PRs without changesets will not break CI but the release workflow will skip those packages. If your PR genuinely doesn't need a changeset (docs-only, CI-only, README), include `[skip changeset]` in the PR title.

See [`.changeset/README.md`](./.changeset/README.md) for full versioning rules — `@filler-sdk/sdk` and `@filler-sdk/jit-hints` are in a `fixed` group (always bump together); `create-filler` versions independently.

### Local testing before PR

Run the same suite CI runs:

```bash
# TypeScript
bun run lint
bun run typecheck
bun run --filter '@filler-sdk/*' test
bun run build

# Solidity
cd contracts
forge fmt --check
forge build
forge test
forge snapshot --check
cd ..

# (Optional) Slither — requires `pip install slither-analyzer`
bun run slither
```

If anything fails locally that didn't fail in CI, open an issue — that's a CI gap.

## Pull request process

1. Fork (if external contributor) or branch off `main`
2. Implement following the relevant `plans/sprint-XX/YY-name.md`
3. Add a changeset if applicable (`bun changeset`)
4. Open a PR using the template
5. **Link the plan in the PR description** (this gives reviewers context)
6. Wait for CI green + at least one approving review (for non-trivial changes)
7. Address review feedback
8. Maintainer merges (squash-and-merge by default; `rebase-and-merge` for multi-commit feature branches)

## Smart contract changes

Solidity changes have **additional gates** — see [`plans/sprint-01-smart-contracts/README.md`](../plans/sprint-01-smart-contracts/README.md) and the [security checklist](../plans/sprint-01-smart-contracts/security-checklist.md).

Quick summary:

- **Slither clean** (0 medium+ findings)
- **Coverage ≥ 90%** line, 100% on critical functions
- **Echidna properties** pass (1M+ runs for changes to invariants)
- **Halmos** verification of critical invariants if logic changes
- **Gas snapshot diff** posted on PR — review whether the change is acceptable
- **Manual security review** by at least one person other than the author for any change to `Filler.sol`, `FillerBond.sol`, or shared libraries
- **ADR** in `docs/adr/` for non-trivial architecture decisions

## Code style

- **TypeScript**: [Biome](https://biomejs.dev) handles lint + format. Run `bun run format` to autofix.
- **Solidity**: `forge fmt` formats per the canonical style. Run `bun run fmt:contracts`.
- **Conventional comments**: only add comments where they explain *why*, not *what*. The code says what.
- **No `any` in public TypeScript API surfaces.** Use `unknown` or precise types.
- **Custom errors over require strings** in Solidity (see PRINCIPLES §1).

## Architecture decisions

For non-trivial design choices, add an [Architecture Decision Record (ADR)](./docs/adr/0000-template.md) in `docs/adr/`. The PR template will remind you.

## Getting help

- **Questions / discussions** → [GitHub Discussions](https://github.com/DavidZapataOh/filler-sdk/discussions)
- **Bugs** → [Bug Report Issue](https://github.com/DavidZapataOh/filler-sdk/issues/new?template=bug_report.yml)
- **Security vulnerabilities** → email **security@filler-sdk.xyz** (see [SECURITY.md](./SECURITY.md)) — **do not file public issues for security**
- **Discord** → https://discord.gg/filler-sdk

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree your contributions will be licensed under the [MIT License](./LICENSE).

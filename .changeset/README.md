# Changesets

This directory holds changesets — small `.md` files that describe what changed in a PR. They are then used by [Changesets](https://github.com/changesets/changesets) to:

- Determine version bumps for each package (patch / minor / major)
- Generate `CHANGELOG.md` entries for each release

## Adding a changeset

```bash
bun changeset
```

Follow the prompts:

1. Select the packages your PR affects
2. Choose the bump type (patch / minor / major)
3. Write a one-line summary

This creates `.changeset/<random-name>.md`. **Commit it with your PR.**

PRs that modify code under `packages/*` should add a changeset. PRs that don't (docs, CI, tests, refactors with no behavior change) can skip it — but include `[skip changeset]` in the PR title or description so the bot doesn't complain.

## Versioning rules (from `config.json`)

- **`@filler-sdk/sdk` and `@filler-sdk/jit-hints`** are in a `fixed` group — they always bump together to the same version, even if your changeset only mentions one of them. This guarantees that downstream consumers can pin a single version line.
- **`create-filler`** versions independently — its release cadence does not need to match the SDK's.
- **Apps and examples** (`apps/dashboard`, `apps/docs`, `examples/*`) are private packages — `privatePackages.version: false` keeps them out of changesets entirely. They are not published to npm.
- All published packages use **`access: public`** under the `@filler-sdk` scope (or as the `create-filler` root package).

## Release workflow (automated)

When a PR with changesets merges to `main`, the [Release workflow](../.github/workflows/release.yml) automatically opens a "Version Packages" PR that:

- Bumps the affected packages
- Updates `CHANGELOG.md` files
- Removes the consumed `.changeset/*.md` files

Merging that PR triggers the same workflow, which now:

- Builds all packages
- Runs tests
- Publishes the bumped packages to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements)
- Creates GitHub Releases with auto-generated notes

## Snapshot (canary) releases

For testing pre-release changes without bumping the public version:

```bash
bun run release:snapshot
```

This publishes packages tagged as `canary`, installable via:

```bash
bun add @filler-sdk/sdk@canary
```

Useful during sprints to give Sprint 04 (CLI templates) and Sprint 05 (dashboard) something to consume before we cut a stable release.

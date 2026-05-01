/**
 * create-filler
 *
 * Scaffold a new Filler SDK solver in seconds. Run via `npx create-filler`.
 *
 * Full CLI implementation in Sprint 04 Plan 01. This skeleton exists for
 * monorepo workspace resolution and CI smoke tests.
 *
 * Note: cross-workspace TypeScript resolution (e.g. `import { ... } from
 * '@filler-sdk/sdk'`) is deferred to Sprint 04 when the CLI actually depends
 * on SDK. At that point we will set up TypeScript project references with
 * `composite: true` so tsc resolves dist types from sibling packages without
 * a build step. Bun's runtime resolution already works via workspace:* (see
 * `bun pm ls`).
 *
 * @see plans/sprint-04-cli-references/01-cli-architecture.md
 */

export const CLI_VERSION = '0.0.0' as const;

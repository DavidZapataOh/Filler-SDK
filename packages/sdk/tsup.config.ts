import { defineConfig } from 'tsup';

/**
 * @filler-sdk/sdk — bundler config.
 *
 * Emits five entry points (matching `package.json` `exports`):
 *
 *   index       — public surface: createFiller + types + errors + chains
 *   bond        — `BondClient` (Plan 07)
 *   keeperhub   — `KeeperHubClient` (Plan 08)
 *   testing     — Anvil + mock fixtures (Plan 09)
 *   abis        — auto-generated ABIs (re-exported as `as const`)
 *
 * Each emits both ESM (`.js`) and CJS (`.cjs`) plus its own `.d.ts`. Code
 * splitting is on so common chunks (e.g. shared types) are deduped.
 *
 * Tree-shaking + `sideEffects: false` (in package.json) means unused entries
 * cost the bundler nothing in a downstream app. The size-limit job in CI
 * gates each entry independently — see `.size-limit.json`.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bond: 'src/bond/index.ts',
    keeperhub: 'src/keeperhub/index.ts',
    testing: 'src/testing/index.ts',
    abis: 'src/abis/index.ts',
  },
  format: ['esm', 'cjs'],
  outExtension: ({ format }) => ({
    js: format === 'esm' ? '.js' : '.cjs',
  }),
  dts: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  // peer + workspace deps must NOT be bundled — downstream consumers bring
  // their own viem, and the SDK consuming jit-hints types needs them as
  // module-level imports, not inlined into the SDK bundle.
  external: ['viem', '@filler-sdk/jit-hints', 'pino', 'zod'],
});

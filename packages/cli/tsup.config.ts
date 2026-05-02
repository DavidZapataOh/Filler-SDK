import { defineConfig } from 'tsup';

/**
 * `create-filler` — bundler config.
 *
 * Single-entry, ESM-only, Node 20+ runtime. The build is a CLI binary, not a
 * library — no .d.ts emission needed (consumers run `npx create-filler`,
 * they don't import from us). Minify is on so `npx` cold-start is fast.
 *
 * The shebang banner makes `dist/cli.js` directly executable on Unix
 * platforms when installed via `npm install -g`.
 */
export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  dts: false,
  splitting: false,
  clean: true,
  sourcemap: false,
  minify: true,
  // Externalise dependencies — `npm install -g create-filler` resolves them
  // from the user's node_modules; bundling them would 5×+ the install size.
  external: ['@clack/prompts', 'commander', 'picocolors', 'zod'],
});

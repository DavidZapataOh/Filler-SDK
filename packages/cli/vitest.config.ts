import { defineConfig } from 'vitest/config';

/**
 * Default vitest run excludes the E2E suite so `bun run test` stays fast +
 * doesn't require `dist/cli.js` to exist. The E2E tests spawn the built
 * CLI binary as a real subprocess for each vertical — slower but the only
 * way to catch cross-platform spawn / path / line-ending bugs.
 *
 * Run E2E tests via `bun run test:e2e` (which sets `--mode e2e`). Plan 06
 * (Sprint 04) wires this into the `cli-e2e.yml` GitHub Actions workflow
 * with a 3-OS matrix.
 *
 * Why `--mode e2e` instead of an env var prefix: `FOO=1 cmd` doesn't work on
 * Windows cmd.exe. `--mode` is a vitest CLI flag and works on every shell,
 * which matters for Plan 06's cross-platform CI.
 */
export default defineConfig(({ mode }) => {
  const e2e = mode === 'e2e';

  return {
    test: {
      include: e2e
        ? ['test/**/e2e.test.ts']
        : ['test/**/*.test.ts'],
      exclude: e2e
        ? ['node_modules/**']
        : ['node_modules/**', 'test/**/e2e.test.ts'],
      // E2E spawns the CLI subprocess + may rebuild the workspace on slow
      // Windows runners. Default vitest test timeout (5s) is too short.
      testTimeout: e2e ? 120_000 : 5_000,
      // Sequential E2E — concurrent scaffolds can race on shared tmp paths
      // or thrash slow CI disks. Default suite stays parallel.
      pool: e2e ? 'forks' : 'threads',
      ...(e2e ? { forks: { singleFork: true } } : {}),
    },
  };
});

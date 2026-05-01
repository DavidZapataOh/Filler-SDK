/// <reference types="ponder/virtual" />

// This file enables type checking and editor autocomplete for the Ponder virtual
// modules (`ponder:registry`, `ponder:schema`, `ponder:api`). Ponder generates an
// equivalent file when you run `ponder dev`; we commit it so `bun run typecheck`
// works without first booting the indexer.
//
// After upgrading Ponder, run `ponder dev` once to detect drift and re-commit.
// See https://ponder.sh/docs/requirements#typescript

declare module 'ponder:internal' {
  const config: typeof import('./ponder.config.ts');
  const schema: typeof import('./ponder.schema.ts');
}

declare module 'ponder:schema' {
  export * from './ponder.schema.ts';
}

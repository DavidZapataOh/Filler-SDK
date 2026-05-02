/**
 * CLI type aliases — kept separate from `validation.ts` so the type-only
 * imports don't pull in zod transitively.
 *
 * `ChainName` mirrors `@filler-sdk/sdk:ChainName`. We don't import directly
 * from the SDK because (a) the CLI bundle should be thin, (b) the SDK might
 * not be on disk yet during local CLI development. The shape is duplicated
 * here as a literal union and tested in `test/validation.test.ts`.
 */

export type ChainName =
  | 'mainnet'
  | 'unichain'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'sepolia'
  | 'unichainSepolia'
  | 'foundry';

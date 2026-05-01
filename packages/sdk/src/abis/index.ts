/**
 * Auto-generated `as const` ABI bindings.
 *
 * Each export is an `as const` array — viem narrows function-call argument
 * types and return types from these at compile time, so calls like
 *
 *   import { fillerAbi } from '@filler-sdk/sdk/abis';
 *   await publicClient.readContract({
 *     abi: fillerAbi,
 *     address: addrs.filler,
 *     functionName: 'allowedCurrencies',
 *     args: [tokenAddr],
 *   });
 *
 * are fully type-checked. The shape comes from `forge build` artifacts — to
 * regenerate after a contract change, run `bun run abi:gen` from this package.
 */

export { fillerAbi } from './filler';
export { fillerBondAbi } from './fillerBond';
export { poolManagerAbi } from './poolManager';

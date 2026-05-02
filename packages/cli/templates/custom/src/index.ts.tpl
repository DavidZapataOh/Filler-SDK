/**
 * {{projectName}} — Custom Filler (empty starter)
 *
 * Bare-minimum scaffold. You're on your own from here — wire intents,
 * fills, and your strategy logic from `@filler-sdk/sdk`.
 */

import { createFillerFromPrivateKey } from '@filler-sdk/sdk';

const filler = createFillerFromPrivateKey({
  chainId: 130, // {{chain}} — adjust if your config differs
  privateKey: (process.env['SOLVER_PRIVATE_KEY'] ?? '0x') as `0x${string}`,
  rpcUrl: process.env['RPC_URL'] ?? 'http://localhost:8545',
});

console.log(`[{{projectName}}] solver online as ${filler.account}.`);
console.log('Wire intents + fills. See `@filler-sdk/sdk` docs for the full surface.');

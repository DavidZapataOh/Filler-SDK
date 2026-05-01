# `@filler-sdk/sdk`

> Deploy vertical UniswapX solvers in `npm install`.

```bash
npm install @filler-sdk/sdk viem
# or:  bun add @filler-sdk/sdk viem
# or:  pnpm add @filler-sdk/sdk viem
```

## Status

This package is in active development during ETHGlobal OpenAgents 2026. The
public surface (types, errors, chain registry) is ready for downstream
integration; runtime implementations of `intents` / `fills` / `indexer` land
across [Sprint 03 plans](../../plans/sprint-03-sdk/).

## Quickstart (preview)

```ts
import { createFiller, getDeployedAddresses } from '@filler-sdk/sdk';

const filler = createFiller({
  chainId: 130, // Unichain
  account: '0xYourSolverAccount',
  transport: { publicClient, walletClient }, // bring your own viem clients
});

filler.intents.subscribe({ inputTokens: ['0xUSDC...'] }, async (intent) => {
  const result = await filler.fills.execute(intent, /* params */);
  console.log('filled', result.txHash);
});
```

## Sub-path entries

| Import path                      | What it gives you                                  |
| -------------------------------- | -------------------------------------------------- |
| `@filler-sdk/sdk`                | `createFiller`, types, errors, chain registry      |
| `@filler-sdk/sdk/bond`           | `BondClient` — stake / unstake / withdraw          |
| `@filler-sdk/sdk/keeperhub`      | KeeperHub coordination client                      |
| `@filler-sdk/sdk/testing`        | Anvil + mock fixtures for solver tests             |
| `@filler-sdk/sdk/abis`           | Auto-generated `as const` ABIs for `viem`          |

Each sub-path is independently tree-shakeable: importing the main entry
does NOT pull in the testing/bond/keeperhub bundles.

## License

MIT — see [`LICENSE`](../../LICENSE) at the repo root.

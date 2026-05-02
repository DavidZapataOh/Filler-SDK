[@filler-sdk/sdk](../../README.md) / [index](../README.md) / chains

# Variable: chains

```ts
const chains: Readonly<{
  arbitrum: ChainConfig;
  base: ChainConfig;
  foundry: ChainConfig;
  mainnet: ChainConfig;
  optimism: ChainConfig;
  sepolia: ChainConfig;
  unichain: ChainConfig;
  unichainSepolia: ChainConfig;
}>;
```

Defined in: [packages/sdk/src/chains.ts:235](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L235)

The exhaustive chain registry. Iterated by `getChainById` / `getChainByName`.
Frozen so consumers can't accidentally mutate the deployed addresses table
(e.g. via a misconfigured patch in a downstream library).

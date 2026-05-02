[@filler-sdk/sdk](../../README.md) / [index](../README.md) / getViemChain

# Function: getViemChain()

```ts
function getViemChain(id): Chain;
```

Defined in: [packages/sdk/src/chains.ts:327](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L327)

Resolve a viem `Chain` object for the given chain id. Solver authors call
this when constructing their own `PublicClient` / `WalletClient` (BYO viem
setup) — the SDK's `createFillerFromPrivateKey` shortcut does it
automatically.

## Parameters

### id

[`ChainId`](../type-aliases/ChainId.md)

## Returns

`Chain`

[@filler-sdk/sdk](../../README.md) / [index](../README.md) / PoolId

# Type Alias: PoolId

```ts
type PoolId = `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:49](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L49)

Pool id = `keccak256(abi.encode(PoolKey))`. Always 32 bytes; `0x`-prefixed
66 chars total. The indexer keys all pool state by this hash.

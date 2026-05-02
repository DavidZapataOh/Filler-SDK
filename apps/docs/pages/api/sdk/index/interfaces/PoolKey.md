[@filler-sdk/sdk](../../README.md) / [index](../README.md) / PoolKey

# Interface: PoolKey

Defined in: [packages/sdk/src/types.ts:32](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L32)

v4 PoolKey — the 5-tuple that uniquely identifies a v4 pool. Mirrors the
Solidity struct exactly; ordering matters for `keccak256` pool-id derivation.

## Properties

### currency0

```ts
currency0: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:34](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L34)

ERC-20 with the lower address (`currency0 &lt;\1currency1` is enforced by v4).

***

### currency1

```ts
currency1: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:36](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L36)

ERC-20 with the higher address. Native ETH is encoded as the zero address.

***

### fee

```ts
fee: number;
```

Defined in: [packages/sdk/src/types.ts:38](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L38)

Static fee in pips (`1e6` units). 3000 = 0.30%.

***

### hooks

```ts
hooks: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:42](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L42)

Hook contract address; `0x000…000` for hookless pools.

***

### tickSpacing

```ts
tickSpacing: number;
```

Defined in: [packages/sdk/src/types.ts:40](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L40)

Tick spacing — must match the pool's deployment.

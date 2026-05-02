[@filler-sdk/sdk](../../README.md) / [index](../README.md) / DepthQuery

# Interface: DepthQuery

Defined in: [packages/sdk/src/types.ts:563](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L563)

Mirrored from `@filler-sdk/jit-hints` (the indexer package owns the
canonical wire format). We surface them here so SDK consumers don't need
a second import for one type.

## Properties

### gasPriceGwei?

```ts
optional gasPriceGwei?: number;
```

Defined in: [packages/sdk/src/types.ts:575](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L575)

Optional gas-price override (gwei). When set, the indexer adjusts the
`estimatedNetProfit` field. Otherwise it uses the chain's recent base
fee (Plan 06 refinement; today the indexer ignores this and always
uses defaults).

***

### pool

```ts
pool: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:564](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L564)

***

### size

```ts
size: bigint;
```

Defined in: [packages/sdk/src/types.ts:565](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L565)

***

### slippageBps?

```ts
optional slippageBps?: number;
```

Defined in: [packages/sdk/src/types.ts:568](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L568)

Slippage budget in basis points. Indexer default is 50 bps (0.5%).

***

### zeroForOne

```ts
zeroForOne: boolean;
```

Defined in: [packages/sdk/src/types.ts:566](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L566)

[@filler-sdk/sdk](../../README.md) / [index](../README.md) / DepthHint

# Interface: DepthHint

Defined in: [packages/sdk/src/types.ts:578](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L578)

## Properties

### hint

```ts
hint: object;
```

Defined in: [packages/sdk/src/types.ts:580](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L580)

#### estimatedNetProfit?

```ts
optional estimatedNetProfit?: bigint;
```

Indexer's net-profit estimate (`expectedFeeCapture - expectedGasOverhead`).
The engine uses this for the profitability gate when present.

#### expectedFeeCapture

```ts
expectedFeeCapture: bigint;
```

#### expectedGasOverhead?

```ts
optional expectedGasOverhead?: bigint;
```

Estimated gas overhead for the JIT cycle (mint + swap + burn), in wei.
Useful for net-profit math the engine doesn't run itself.

#### expectedSlippageBps?

```ts
optional expectedSlippageBps?: number;
```

Slippage that the indexer expects this fill to incur (against the
pool's current tick). Optional because not every indexer impl carries
it; jit-hints does.

#### liquidityDelta

```ts
liquidityDelta: bigint;
```

#### tickLower

```ts
tickLower: number;
```

#### tickUpper

```ts
tickUpper: number;
```

***

### pool

```ts
pool: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:579](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L579)

***

### poolState?

```ts
optional poolState?: object;
```

Defined in: [packages/sdk/src/types.ts:606](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L606)

Pool snapshot at hint-generation time. Optional — present in jit-hints'
response, absent in minimal indexer impls.

#### currentSqrtPrice

```ts
currentSqrtPrice: bigint;
```

#### currentTick

```ts
currentTick: number;
```

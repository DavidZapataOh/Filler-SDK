[@filler-sdk/sdk](../../README.md) / [index](../README.md) / PoolInfo

# Interface: PoolInfo

Defined in: [packages/sdk/src/types.ts:537](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L537)

Resolved pool metadata returned by `IndexerSurface.findPool`. Carries the
full PoolKey + identity fields the FillEngine needs to build `FillParams`.

## Properties

### currency0

```ts
currency0: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:541](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L541)

Lower-address token.

***

### currency1

```ts
currency1: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:543](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L543)

Higher-address token.

***

### fee

```ts
fee: number;
```

Defined in: [packages/sdk/src/types.ts:545](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L545)

Static fee in pips.

***

### hooks

```ts
hooks: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:549](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L549)

Hook contract; `0x000…000` for hookless pools.

***

### id

```ts
id: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:539](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L539)

keccak256(PoolKey) — the indexer's primary key.

***

### liquidity

```ts
liquidity: bigint;
```

Defined in: [packages/sdk/src/types.ts:553](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L553)

Current liquidity across the pool.

***

### sqrtPriceX96

```ts
sqrtPriceX96: bigint;
```

Defined in: [packages/sdk/src/types.ts:551](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L551)

Current sqrt(price) × 2^96. Useful for the FillEngine's calibration.

***

### tick

```ts
tick: number;
```

Defined in: [packages/sdk/src/types.ts:555](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L555)

Current tick.

***

### tickSpacing

```ts
tickSpacing: number;
```

Defined in: [packages/sdk/src/types.ts:547](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L547)

Tick spacing — both fill ticks must be divisible by this.

[@filler-sdk/sdk](../../README.md) / [index](../README.md) / FillParams

# Interface: FillParams

Defined in: [packages/sdk/src/types.ts:168](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L168)

Parameters for a single fill, as constructed by the FillEngine (Plan 04).

Shape mirrors the Solidity `FillParams` struct in
`contracts/src/libraries/FillParams.sol` exactly, so ABI-encoding via viem's
`encodeAbiParameters` produces bytes that round-trip through the contract's
`FillParamsLib.validate()`.

Field-by-field invariants (enforced on-chain):
  - `tickLower &lt;\1tickUpper`, both within [MIN_TICK, MAX_TICK]
  - both ticks divisible by `poolKey.tickSpacing`
  - `liquidityDelta`, `inputAmount`, `outputAmount` all non-zero
  - `inputCurrency`/`outputCurrency` match `poolKey.currency0/1` per `zeroForOne`
  - `deadline > block.timestamp`

## Properties

### deadline

```ts
deadline: bigint;
```

Defined in: [packages/sdk/src/types.ts:190](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L190)

UNIX timestamp past which the fill is invalid.

***

### feesCaptured

```ts
feesCaptured: bigint;
```

Defined in: [packages/sdk/src/types.ts:188](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L188)

Estimated fees captured — emitted in events for analytics.

***

### inputAmount

```ts
inputAmount: bigint;
```

Defined in: [packages/sdk/src/types.ts:176](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L176)

Amount of `inputCurrency` provided.

***

### inputCurrency

```ts
inputCurrency: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:172](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L172)

Currency the swapper is sending in.

***

### liquidityDelta

```ts
liquidityDelta: bigint;
```

Defined in: [packages/sdk/src/types.ts:186](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L186)

Liquidity to add (and later remove) for the JIT cycle.

***

### outputAmount

```ts
outputAmount: bigint;
```

Defined in: [packages/sdk/src/types.ts:178](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L178)

Minimum amount of `outputCurrency` the swapper accepts.

***

### outputCurrency

```ts
outputCurrency: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:174](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L174)

Currency the swapper expects out.

***

### poolKey

```ts
poolKey: PoolKey;
```

Defined in: [packages/sdk/src/types.ts:170](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L170)

PoolKey of the v4 pool to route through.

***

### tickLower

```ts
tickLower: number;
```

Defined in: [packages/sdk/src/types.ts:182](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L182)

Lower bound of the JIT range (must align to `poolKey.tickSpacing`).

***

### tickUpper

```ts
tickUpper: number;
```

Defined in: [packages/sdk/src/types.ts:184](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L184)

Upper bound of the JIT range.

***

### zeroForOne

```ts
zeroForOne: boolean;
```

Defined in: [packages/sdk/src/types.ts:180](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L180)

True for token0 → token1; false for token1 → token0.

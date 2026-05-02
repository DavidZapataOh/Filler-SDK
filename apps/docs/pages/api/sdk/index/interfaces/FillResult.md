[@filler-sdk/sdk](../../README.md) / [index](../README.md) / FillResult

# Interface: FillResult

Defined in: [packages/sdk/src/types.ts:197](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L197)

What a fill produced — returned to user code after a successful broadcast.
Failures throw a typed `FillerError` instead.

## Properties

### blockNumber

```ts
blockNumber: bigint;
```

Defined in: [packages/sdk/src/types.ts:201](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L201)

Block number it was included in (post-receipt).

***

### effectiveGasPriceWei

```ts
effectiveGasPriceWei: bigint;
```

Defined in: [packages/sdk/src/types.ts:203](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L203)

Effective gas price paid (priority + base).

***

### feeCapturedAmount

```ts
feeCapturedAmount: bigint;
```

Defined in: [packages/sdk/src/types.ts:207](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L207)

Fee captured by the solver, in the output token.

***

### gasUsed

```ts
gasUsed: bigint;
```

Defined in: [packages/sdk/src/types.ts:205](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L205)

Total gas used.

***

### intent

```ts
intent: Intent;
```

Defined in: [packages/sdk/src/types.ts:209](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L209)

The original intent that was filled.

***

### params

```ts
params: FillParams;
```

Defined in: [packages/sdk/src/types.ts:211](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L211)

The params used to fill it.

***

### txHash

```ts
txHash: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:199](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L199)

Transaction hash of the broadcast fill.

[@filler-sdk/sdk](../../README.md) / [index](../README.md) / Intent

# Interface: Intent

Defined in: [packages/sdk/src/types.ts:57](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L57)

A UniswapX intent, as parsed from the on-chain `OrderEvent` log. The SDK
normalises Reactor-specific fields into this canonical shape so solver
authors don't have to special-case ExclusiveDutchOrder vs V2DutchOrder vs
future order types.

## Properties

### additionalValidationContract

```ts
additionalValidationContract: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:67](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L67)

Optional additional validation contract (`address(0)` if unset).

***

### additionalValidationData

```ts
additionalValidationData: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:69](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L69)

Encoded `bytes` passed to additional validation, if any.

***

### chainId

```ts
chainId: ChainId;
```

Defined in: [packages/sdk/src/types.ts:75](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L75)

Chain id the order is valid on.

***

### deadline

```ts
deadline: bigint;
```

Defined in: [packages/sdk/src/types.ts:65](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L65)

UNIX timestamp (seconds) past which the order is no longer fillable.

***

### input

```ts
input: TokenAmount;
```

Defined in: [packages/sdk/src/types.ts:71](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L71)

Input token + amount the swapper offers.

***

### nonce

```ts
nonce: bigint;
```

Defined in: [packages/sdk/src/types.ts:63](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L63)

Order nonce, scoped to the swapper's Permit2.

***

### observedAt

```ts
observedAt: bigint;
```

Defined in: [packages/sdk/src/types.ts:77](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L77)

Block number at which we observed the order.

***

### orderHash

```ts
orderHash: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:81](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L81)

keccak256 of the canonical encoded order (used as the unique key).

***

### outputs

```ts
outputs: ResolvedOutput[];
```

Defined in: [packages/sdk/src/types.ts:73](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L73)

Output tokens + minimums the swapper requires.

***

### rawOrder

```ts
rawOrder: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:87](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L87)

Raw ABI-encoded order bytes — required to reconstruct a `SignedOrder` for
`Filler.execute(SignedOrder, bytes)`. Sourced from the original
`OrderEvent` log payload.

***

### reactor

```ts
reactor: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:59](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L59)

Reactor that emitted the order — used to route fills back.

***

### signature

```ts
signature: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:89](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L89)

Swapper's signature over the canonical order bytes.

***

### swapper

```ts
swapper: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:61](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L61)

Address that signed the order (the swapper).

***

### txHash

```ts
txHash: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:79](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L79)

Transaction hash that emitted the order log.

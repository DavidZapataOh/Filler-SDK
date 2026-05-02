[@filler-sdk/sdk](../../README.md) / [index](../README.md) / ResolvedOutput

# Interface: ResolvedOutput

Defined in: [packages/sdk/src/types.ts:97](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L97)

## Properties

### amount

```ts
amount: bigint;
```

Defined in: [packages/sdk/src/types.ts:100](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L100)

Minimum amount the swapper must receive on the output side.

***

### recipient

```ts
recipient: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:102](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L102)

Recipient (usually the swapper, but Permit2 allows redirection).

***

### token

```ts
token: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:98](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L98)

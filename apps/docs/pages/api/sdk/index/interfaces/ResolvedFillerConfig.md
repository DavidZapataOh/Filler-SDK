[@filler-sdk/sdk](../../README.md) / [index](../README.md) / ResolvedFillerConfig

# Interface: ResolvedFillerConfig

Defined in: [packages/sdk/src/types.ts:464](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L464)

Resolved + validated config — what the SDK uses internally. Same shape as
`FillerConfig` but with every default applied.

## Properties

### account

```ts
account: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:466](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L466)

***

### addresses

```ts
addresses: ChainContractAddresses;
```

Defined in: [packages/sdk/src/types.ts:468](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L468)

***

### chainId

```ts
chainId: ChainId;
```

Defined in: [packages/sdk/src/types.ts:465](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L465)

***

### indexer

```ts
indexer: Required<IndexerConfig>;
```

Defined in: [packages/sdk/src/types.ts:469](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L469)

***

### intentQueueSize

```ts
intentQueueSize: number;
```

Defined in: [packages/sdk/src/types.ts:472](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L472)

***

### intentSource

```ts
intentSource: IntentSourceLike | null;
```

Defined in: [packages/sdk/src/types.ts:471](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L471)

***

### keeperHub

```ts
keeperHub: KeeperHubConfig | null;
```

Defined in: [packages/sdk/src/types.ts:470](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L470)

***

### logger

```ts
logger: FillerLogger;
```

Defined in: [packages/sdk/src/types.ts:473](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L473)

***

### transport

```ts
transport: FillerTransport;
```

Defined in: [packages/sdk/src/types.ts:467](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L467)

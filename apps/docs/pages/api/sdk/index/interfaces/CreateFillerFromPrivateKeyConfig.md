[@filler-sdk/sdk](../../README.md) / [index](../README.md) / CreateFillerFromPrivateKeyConfig

# Interface: CreateFillerFromPrivateKeyConfig

Defined in: [packages/sdk/src/createFiller.ts:185](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L185)

`@filler-sdk/sdk` — public entry point.

Anything exported from here is part of the package's stable API. Adding,
removing or renaming an export here is a semver-breaking change.

Sub-path entries:
  '@filler-sdk/sdk/bond'      — BondClient (Plan 07)
  '@filler-sdk/sdk/keeperhub' — KeeperHubClient (Plan 08)
  '@filler-sdk/sdk/testing'   — Anvil + mock fixtures (Plan 09)
  '@filler-sdk/sdk/abis'      — auto-generated ABIs

The sub-path entries are tree-shakeable — importing the main entry does
NOT pull in bond/keeperhub/testing/abis bundles.

## Properties

### addresses?

```ts
optional addresses?: Partial<ChainContractAddresses>;
```

Defined in: [packages/sdk/src/createFiller.ts:193](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L193)

***

### chainId

```ts
chainId: ChainId;
```

Defined in: [packages/sdk/src/createFiller.ts:186](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L186)

***

### indexer?

```ts
optional indexer?: IndexerConfig;
```

Defined in: [packages/sdk/src/createFiller.ts:194](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L194)

***

### intentQueueSize?

```ts
optional intentQueueSize?: number;
```

Defined in: [packages/sdk/src/createFiller.ts:197](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L197)

***

### intentSource?

```ts
optional intentSource?: IntentSourceLike;
```

Defined in: [packages/sdk/src/createFiller.ts:196](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L196)

***

### keeperHub?

```ts
optional keeperHub?: KeeperHubConfig;
```

Defined in: [packages/sdk/src/createFiller.ts:195](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L195)

***

### logger?

```ts
optional logger?: FillerLogger;
```

Defined in: [packages/sdk/src/createFiller.ts:198](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L198)

***

### privateKey

```ts
privateKey: `0x${string}`;
```

Defined in: [packages/sdk/src/createFiller.ts:188](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L188)

0x-prefixed 32-byte hex private key. Validated, never logged.

***

### rpcUrl

```ts
rpcUrl: string;
```

Defined in: [packages/sdk/src/createFiller.ts:190](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L190)

RPC URL — must be https:// (http:// only allowed for localhost / anvil).

***

### wsRpcUrl?

```ts
optional wsRpcUrl?: string;
```

Defined in: [packages/sdk/src/createFiller.ts:192](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L192)

Optional WebSocket RPC URL for event subscription (wss://).

[@filler-sdk/sdk](../../README.md) / [index](../README.md) / FillerConfig

# Interface: FillerConfig

Defined in: [packages/sdk/src/types.ts:356](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L356)

User-supplied configuration. Validated at runtime by `createFiller`.

## Properties

### account

```ts
account: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:360](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L360)

Solver account address. The SDK NEVER touches private keys.

***

### addresses?

```ts
optional addresses?: Partial<Pick<ChainContractAddresses, "poolManager" | "reactor" | "filler" | "fillerBond">>;
```

Defined in: [packages/sdk/src/types.ts:372](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L372)

On-chain contract addresses. Required for `submitFill` / bond ops. If
omitted the SDK falls back to `getDeployedAddresses(chainId)` — but for
mainnets these are placeholder until Sprint 01's deploy script lands, so
production callers MUST set them explicitly.

***

### chainId

```ts
chainId: ChainId;
```

Defined in: [packages/sdk/src/types.ts:358](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L358)

Chain to operate on.

***

### indexer?

```ts
optional indexer?: IndexerConfig;
```

Defined in: [packages/sdk/src/types.ts:378](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L378)

Optional `IndexerClient` config. Defaults to `https://hints.filler.xyz`
(the public hosted indexer) but every solver SHOULD self-host (see
`@filler-sdk/jit-hints`).

***

### intentQueueSize?

```ts
optional intentQueueSize?: number;
```

Defined in: [packages/sdk/src/types.ts:396](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L396)

Per-subscriber bounded queue size for the IntentStream's backpressure.
Default 100. Drops are counted in `IntentStream.droppedTotal`.

***

### intentSource?

```ts
optional intentSource?: IntentSourceLike;
```

Defined in: [packages/sdk/src/types.ts:391](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L391)

Optional intent source — pluggable transport for the IntentStream.
Defaults to `null` ("no feed"); subscribers attach but receive nothing
until a source is wired. Pass `createPollingIntentSource(...)` for
production, `createMockIntentSource(...)` for tests, or implement your
own. Plan 03.

***

### keeperHub?

```ts
optional keeperHub?: KeeperHubConfig;
```

Defined in: [packages/sdk/src/types.ts:383](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L383)

Optional KeeperHub config. When set, `submitFill(&#123; useKeeperHub: true &#125;)`
routes through the hub's mempool-private path. Plan 08.

***

### logger?

```ts
optional logger?: FillerLogger;
```

Defined in: [packages/sdk/src/types.ts:398](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L398)

Optional logger; defaults to a Pino instance with sensible production defaults.

***

### transport

```ts
transport: FillerTransport;
```

Defined in: [packages/sdk/src/types.ts:365](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L365)

viem PublicClient + WalletClient. The SDK is signer-agnostic — bring your
own (Privy, Turnkey, raw private key, hardware wallet, etc.).

[@filler-sdk/sdk](../../README.md) / [keeperhub](../README.md) / KeeperHubClient

# Class: KeeperHubClient

Defined in: [packages/sdk/src/keeperhub/client.ts:122](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L122)

`@filler-sdk/sdk/keeperhub` — KeeperHub client public surface.

Class shape ships in Plan 02; methods (`register`, `heartbeat`,
`subscribeAssignments`) land in Plan 08.

## Constructors

### Constructor

```ts
new KeeperHubClient(cfg): KeeperHubClient;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:133](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L133)

#### Parameters

##### cfg

[`KeeperHubClientConfig`](../interfaces/KeeperHubClientConfig.md)

#### Returns

`KeeperHubClient`

## Properties

### account

```ts
readonly account: `0x${string}`;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:130](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L130)

***

### chainId

```ts
readonly chainId: ChainId;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:129](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L129)

***

### fillerContract

```ts
readonly fillerContract: `0x${string}`;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:131](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L131)

## Accessors

### baseUrl

#### Get Signature

```ts
get baseUrl(): string;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:146](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L146)

Resolved base URL (no trailing slash).

##### Returns

`string`

***

### timeoutMs

#### Get Signature

```ts
get timeoutMs(): number;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:151](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L151)

Default workflow timeout (ms).

##### Returns

`number`

## Methods

### getStatus()

```ts
getStatus(workflowId): Promise<{
  error?: string;
  result?: {
     blockNumber: string;
     effectiveGasPriceWei?: string;
     gasUsed: string;
     txHash: string;
  };
  status: "pending" | "submitted" | "completed" | "failed";
  workflowId: string;
}>;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:241](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L241)

Fetch a workflow's current status. Useful for manual polling, dashboards,
or operator debugging. Most callers should use `submitFill` instead.

#### Parameters

##### workflowId

`string`

#### Returns

`Promise`&lt;\&#123;
  `error?`: `string`;
  `result?`: \&#123;
     `blockNumber`: `string`;
     `effectiveGasPriceWei?`: `string`;
     `gasUsed`: `string`;
     `txHash`: `string`;
  \&#125;;
  `status`: `"pending"` \| `"submitted"` \| `"completed"` \| `"failed"`;
  `workflowId`: `string`;
\&#125;&gt;

***

### submitFill()

```ts
submitFill(
   intent, 
   params, 
   gasLimit, 
   options?): Promise<FillResult>;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:166](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L166)

Submit a fill to KeeperHub's private-mempool router and block until the
workflow resolves. Returns the canonical `FillResult` so the caller can
substitute KeeperHub for the direct path transparently.

Throws:
  - `BroadcastFailedError` — workflow status `failed`.
  - `TimeoutError`         — workflow didn't resolve before `timeoutMs`.
  - `RPCError`             — HTTP / parse failures (after retries).
  - `ConfigInvalidError`   — empty apiKey / non-https baseUrl on construction.

#### Parameters

##### intent

[`Intent`](../../index/interfaces/Intent.md)

##### params

[`FillParams`](../../index/interfaces/FillParams.md)

##### gasLimit

`bigint`

##### options?

`SubmitFillKeeperHubOptions` = `&#123;&#125;`

#### Returns

`Promise`&lt;[`FillResult`](../../index/interfaces/FillResult.md)&gt;

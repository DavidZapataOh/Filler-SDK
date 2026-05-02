[@filler-sdk/sdk](../../README.md) / [keeperhub](../README.md) / KeeperHubClientConfig

# Interface: KeeperHubClientConfig

Defined in: [packages/sdk/src/keeperhub/client.ts:85](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L85)

## Properties

### account

```ts
account: `0x${string}`;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:93](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L93)

Solver account (forwarded to the hub).

***

### apiKey

```ts
apiKey: string;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:89](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L89)

Bearer token issued during solver onboarding.

***

### baseUrl

```ts
baseUrl: string;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:87](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L87)

Hub base URL — must be `https://`.

***

### chainId

```ts
chainId: ChainId;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:91](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L91)

Solver chain id (forwarded to the hub for routing).

***

### fetch?

```ts
optional fetch?: (input, init?) => Promise<Response>;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:98](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L98)

Optional fetch override for tests.

#### Parameters

##### input

`string` \| `URL` \| `Request`

##### init?

`RequestInit`

#### Returns

`Promise`&lt;`Response`&gt;

***

### fillerContract

```ts
fillerContract: `0x${string}`;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:95](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L95)

Address of the deployed `Filler.sol` whose callback the hub will invoke.

***

### logger

```ts
logger: FillerLogger;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:96](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L96)

***

### requestTimeoutMs?

```ts
optional requestTimeoutMs?: number;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:102](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L102)

Override the per-request timeout (default 10s).

***

### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: [packages/sdk/src/keeperhub/client.ts:100](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/keeperhub/client.ts#L100)

Override the workflow timeout (default 60s).

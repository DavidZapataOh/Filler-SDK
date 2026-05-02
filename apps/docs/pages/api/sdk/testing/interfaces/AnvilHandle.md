[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / AnvilHandle

# Interface: AnvilHandle

Defined in: [packages/sdk/src/testing/anvil.ts:51](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L51)

## Properties

### port

```ts
readonly port: number;
```

Defined in: [packages/sdk/src/testing/anvil.ts:55](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L55)

Resolved port.

***

### process

```ts
readonly process: ChildProcess;
```

Defined in: [packages/sdk/src/testing/anvil.ts:57](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L57)

Underlying `ChildProcess`. Useful for advanced lifecycle (rare).

***

### url

```ts
readonly url: string;
```

Defined in: [packages/sdk/src/testing/anvil.ts:53](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L53)

Anvil RPC URL (e.g. `http://127.0.0.1:8545`).

## Methods

### stop()

```ts
stop(): Promise<void>;
```

Defined in: [packages/sdk/src/testing/anvil.ts:59](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L59)

SIGTERM + (after 5s) SIGKILL. Idempotent.

#### Returns

`Promise`&lt;`void`&gt;

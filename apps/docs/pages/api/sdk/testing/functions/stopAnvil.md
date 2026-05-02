[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / stopAnvil

# Function: stopAnvil()

```ts
function stopAnvil(proc): Promise<void>;
```

Defined in: [packages/sdk/src/testing/anvil.ts:189](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L189)

Stop a running anvil. Sends SIGTERM, waits for `'exit'` (5s budget), then
SIGKILLs as fallback. Idempotent — safe to call multiple times.

## Parameters

### proc

`ChildProcess`

## Returns

`Promise`&lt;`void`&gt;

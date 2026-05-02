[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / startAnvil

# Function: startAnvil()

```ts
function startAnvil(opts?): Promise<AnvilHandle>;
```

Defined in: [packages/sdk/src/testing/anvil.ts:94](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L94)

Spawn anvil + wait for ready. Returns a handle whose `.stop()` cleans up.

## Parameters

### opts?

[`StartAnvilOptions`](../interfaces/StartAnvilOptions.md) = `&#123;&#125;`

## Returns

`Promise`&lt;[`AnvilHandle`](../interfaces/AnvilHandle.md)&gt;

## Throws

if `anvil` isn't on PATH or doesn't reach ready within 10s.

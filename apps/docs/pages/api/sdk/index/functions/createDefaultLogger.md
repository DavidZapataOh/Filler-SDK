[@filler-sdk/sdk](../../README.md) / [index](../README.md) / createDefaultLogger

# Function: createDefaultLogger()

```ts
function createDefaultLogger(opts?): Logger;
```

Defined in: [packages/sdk/src/logger.ts:41](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/logger.ts#L41)

Build a fresh Pino logger with the SDK's defaults. Users can either:
  - pass their own `FillerLogger` to `createFiller` (preferred), or
  - call this and pass the result, optionally with a `level` override.

## Parameters

### opts?

#### bindings?

`Record`&lt;`string`, `unknown`&gt;

#### level?

`LevelWithSilentOrString`

## Returns

`Logger`

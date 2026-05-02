[@filler-sdk/sdk](../../README.md) / [index](../README.md) / silenceLoggerForTests

# Function: silenceLoggerForTests()

```ts
function silenceLoggerForTests(): void;
```

Defined in: [packages/sdk/src/logger.ts:95](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/logger.ts#L95)

Test-only: silence the module-level default logger. Has no effect on
user-supplied loggers (those are theirs to silence).

## Returns

`void`

[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / MockIntentSourceOptions

# Interface: MockIntentSourceOptions

Defined in: [packages/sdk/src/intents/mockSource.ts:37](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L37)

## Properties

### initial?

```ts
optional initial?: readonly Intent[];
```

Defined in: [packages/sdk/src/intents/mockSource.ts:39](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L39)

Initial snapshot returned by `list()`.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/intents/mockSource.ts:41](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L41)

Custom label. Defaults to `'mock'`.

***

### throwOnStart?

```ts
optional throwOnStart?: boolean;
```

Defined in: [packages/sdk/src/intents/mockSource.ts:43](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L43)

If true, `start()` throws synchronously — for source-error tests.

[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / MockIntentSource

# Interface: MockIntentSource

Defined in: [packages/sdk/src/intents/mockSource.ts:22](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L22)

## Extends

- `IntentSource`

## Properties

### label

```ts
readonly label: string;
```

Defined in: [packages/sdk/src/intents/source.ts:76](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/source.ts#L76)

Human-readable label for logs / metrics (e.g. `"polling:hints.filler.xyz"`,
`"chain-fill:0x123"`). The engine includes this in subscription-related
log lines.

#### Inherited from

```ts
IntentSource.label
```

***

### lastSink

```ts
readonly lastSink: IntentSink | null;
```

Defined in: [packages/sdk/src/intents/mockSource.ts:34](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L34)

Last sink seen by `start`. Useful for tests asserting hasSubscribers.

***

### startCount

```ts
readonly startCount: number;
```

Defined in: [packages/sdk/src/intents/mockSource.ts:30](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L30)

Total times `start()` has been called (lazy-boot tests).

***

### started

```ts
readonly started: boolean;
```

Defined in: [packages/sdk/src/intents/mockSource.ts:28](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L28)

True from the moment `start()` returns until the stop fn resolves.

***

### stopCount

```ts
readonly stopCount: number;
```

Defined in: [packages/sdk/src/intents/mockSource.ts:32](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L32)

Total times the stop fn has been invoked.

## Methods

### list()

```ts
list(filter?): Promise<readonly Intent[]>;
```

Defined in: [packages/sdk/src/intents/source.ts:69](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/source.ts#L69)

Snapshot the current open-intent set, with optional filter. May return
`[]` for streaming-only sources that don't keep state.

#### Parameters

##### filter?

[`IntentFilter`](../../index/type-aliases/IntentFilter.md)

#### Returns

`Promise`&lt;readonly [`Intent`](../../index/interfaces/Intent.md)[]&gt;

#### Inherited from

```ts
IntentSource.list
```

***

### pushIntent()

```ts
pushIntent(intent): Promise<void>;
```

Defined in: [packages/sdk/src/intents/mockSource.ts:24](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L24)

Push an intent through the sink. Resolves when the engine has routed it.

#### Parameters

##### intent

[`Intent`](../../index/interfaces/Intent.md)

#### Returns

`Promise`&lt;`void`&gt;

***

### setListSnapshot()

```ts
setListSnapshot(snapshot): void;
```

Defined in: [packages/sdk/src/intents/mockSource.ts:26](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/mockSource.ts#L26)

Replace the snapshot returned by `list(filter?)`.

#### Parameters

##### snapshot

readonly [`Intent`](../../index/interfaces/Intent.md)[]

#### Returns

`void`

***

### start()

```ts
start(sink): IntentSourceStopFn | Promise<IntentSourceStopFn>;
```

Defined in: [packages/sdk/src/intents/source.ts:63](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/intents/source.ts#L63)

Begin pushing intents through `sink`. Implementations typically open a
WebSocket / spin a polling loop / register a listener here, and return
an idempotent stop function that tears everything down.

Throws (sync) on configuration errors (bad URL, missing auth). Runtime
errors (network, parse) MUST be handled internally with retry/backoff —
a source should NEVER kill the engine via an unhandled rejection.

#### Parameters

##### sink

`IntentSink`

#### Returns

`IntentSourceStopFn` \| `Promise`&lt;`IntentSourceStopFn`&gt;

#### Inherited from

```ts
IntentSource.start
```

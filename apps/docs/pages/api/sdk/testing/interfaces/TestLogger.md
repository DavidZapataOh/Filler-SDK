[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / TestLogger

# Interface: TestLogger

Defined in: [packages/sdk/src/testing/logger.ts:21](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/logger.ts#L21)

Minimum surface every logger we accept must implement. Compatible with
`pino`, `console`, `winston`, `tslog`, etc. — solver authors keep their
existing logger.

## Extends

- [`FillerLogger`](../../index/interfaces/FillerLogger.md)

## Properties

### calls

```ts
readonly calls: readonly TestLogCall[];
```

Defined in: [packages/sdk/src/testing/logger.ts:23](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/logger.ts#L23)

All captured log entries, in arrival order.

## Methods

### callsAt()

```ts
callsAt(level): readonly TestLogCall[];
```

Defined in: [packages/sdk/src/testing/logger.ts:25](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/logger.ts#L25)

Convenience: filter calls by level.

#### Parameters

##### level

`"error"` \| `"warn"` \| `"info"` \| `"debug"` \| `"trace"`

#### Returns

readonly [`TestLogCall`](TestLogCall.md)[]

***

### child()?

```ts
optional child(bindings): FillerLogger;
```

Defined in: [packages/sdk/src/types.ts:631](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L631)

#### Parameters

##### bindings

`Record`&lt;`string`, `unknown`&gt;

#### Returns

[`FillerLogger`](../../index/interfaces/FillerLogger.md)

#### Inherited from

[`FillerLogger`](../../index/interfaces/FillerLogger.md).[`child`](../../index/interfaces/FillerLogger.md#child)

***

### debug()

```ts
debug(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:627](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L627)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

#### Inherited from

[`FillerLogger`](../../index/interfaces/FillerLogger.md).[`debug`](../../index/interfaces/FillerLogger.md#debug)

***

### error()

```ts
error(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:630](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L630)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

#### Inherited from

[`FillerLogger`](../../index/interfaces/FillerLogger.md).[`error`](../../index/interfaces/FillerLogger.md#error)

***

### info()

```ts
info(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:628](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L628)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

#### Inherited from

[`FillerLogger`](../../index/interfaces/FillerLogger.md).[`info`](../../index/interfaces/FillerLogger.md#info)

***

### reset()

```ts
reset(): void;
```

Defined in: [packages/sdk/src/testing/logger.ts:27](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/logger.ts#L27)

Reset the buffer.

#### Returns

`void`

***

### trace()

```ts
trace(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:626](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L626)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

#### Inherited from

[`FillerLogger`](../../index/interfaces/FillerLogger.md).[`trace`](../../index/interfaces/FillerLogger.md#trace)

***

### warn()

```ts
warn(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:629](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L629)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

#### Inherited from

[`FillerLogger`](../../index/interfaces/FillerLogger.md).[`warn`](../../index/interfaces/FillerLogger.md#warn)

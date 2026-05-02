[@filler-sdk/sdk](../../README.md) / [index](../README.md) / IntentFilter

# Type Alias: IntentFilter

```ts
type IntentFilter = 
  | IntentFilterCriteria
  | IntentFilterPredicate;
```

Defined in: [packages/sdk/src/types.ts:119](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L119)

Filter passed to `IntentStream` (Plan 03). Two valid shapes:

  1. `IntentFilterCriteria` — a typed object with optional fields. The
     stream evaluates each field against the intent and only emits matches.
     Best for static filters known at boot.

  2. `IntentFilterPredicate` — a function `(intent) => boolean | Promise<boolean>`.
     Best for dynamic filters that depend on per-intent computation
     (e.g. "only intents where the input token is in our hot-pool set").

Anything matched by the filter is pushed to the consumer; non-matches are
dropped at the stream boundary (no per-intent decoding cost downstream).

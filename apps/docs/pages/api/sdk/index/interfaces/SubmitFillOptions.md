[@filler-sdk/sdk](../../README.md) / [index](../README.md) / SubmitFillOptions

# Interface: SubmitFillOptions

Defined in: [packages/sdk/src/types.ts:300](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L300)

Options for `Filler.submitFill` / `fills.execute`.

All fields are optional + have sane defaults wired in `createFiller`. The
struct is open for extension — Plan 08 (KeeperHub) will add fields here
without breaking existing call sites.

## Properties

### gasMultiplier?

```ts
optional gasMultiplier?: number;
```

Defined in: [packages/sdk/src/types.ts:311](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L311)

Multiplier on the simulation's gas estimate before broadcast. Defaults
to `1.2` so we don't underprice volatile blocks.

***

### privateRouting?

```ts
optional privateRouting?: boolean;
```

Defined in: [packages/sdk/src/types.ts:316](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L316)

If true, use the wallet's private-routing transport (Flashbots / Titan /
MEV-Share) when available. Default: false (mempool).

***

### useKeeperHub?

```ts
optional useKeeperHub?: boolean;
```

Defined in: [packages/sdk/src/types.ts:306](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L306)

If true (and KeeperHub is configured), route the fill through the
KeeperHub's mempool-private path. Default: true if KeeperHub is
configured, else false.

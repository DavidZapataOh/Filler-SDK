[@filler-sdk/sdk](../../README.md) / [bond](../README.md) / BondClient

# Class: BondClient

Defined in: [packages/sdk/src/bond/client.ts:71](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L71)

`@filler-sdk/sdk/bond` — bond client public surface.

Imports:
  - `BondClient` (class, Plan 02 wires it; Plan 07 ships the on-chain impls)
  - `BondClientConfig` (config bag for constructing the class)
  - `BondClientHandle` (the structural interface — re-exported from types
    so users can author against it without instantiating)

## Implements

- [`BondClientHandle`](../../index/interfaces/BondClientHandle.md)

## Constructors

### Constructor

```ts
new BondClient(cfg): BondClient;
```

Defined in: [packages/sdk/src/bond/client.ts:80](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L80)

#### Parameters

##### cfg

[`BondClientConfig`](../interfaces/BondClientConfig.md)

#### Returns

`BondClient`

## Properties

### account

```ts
readonly account: `0x${string}`;
```

Defined in: [packages/sdk/src/bond/client.ts:78](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L78)

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`account`](../../index/interfaces/BondClientHandle.md#account)

***

### bondContract

```ts
readonly bondContract: `0x${string}`;
```

Defined in: [packages/sdk/src/bond/client.ts:76](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L76)

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`bondContract`](../../index/interfaces/BondClientHandle.md#bondcontract)

***

### chainId

```ts
readonly chainId: ChainId;
```

Defined in: [packages/sdk/src/bond/client.ts:75](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L75)

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`chainId`](../../index/interfaces/BondClientHandle.md#chainid)

***

### fillerContract

```ts
readonly fillerContract: `0x${string}`;
```

Defined in: [packages/sdk/src/bond/client.ts:77](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L77)

The `Filler.sol` deployment this bond is backing.

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`fillerContract`](../../index/interfaces/BondClientHandle.md#fillercontract)

## Methods

### activeStake()

```ts
activeStake(): Promise<bigint>;
```

Defined in: [packages/sdk/src/bond/client.ts:100](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L100)

Stake currently usable as collateral (`stakeOf(filler, account)`).

#### Returns

`Promise`&lt;`bigint`&gt;

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`activeStake`](../../index/interfaces/BondClientHandle.md#activestake)

***

### cooldownEndsAt()

```ts
cooldownEndsAt(): Promise<bigint | null>;
```

Defined in: [packages/sdk/src/bond/client.ts:123](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L123)

Returns the UNIX timestamp (seconds) at which `withdraw()` becomes
callable. `null` when there's no pending unstake.

The on-chain `pendingWithdrawal` returns `availableAt = type(uint256).max`
when there's no pending request — we map that sentinel to `null`.

#### Returns

`Promise`&lt;`bigint` \| `null`&gt;

***

### pendingUnstake()

```ts
pendingUnstake(): Promise<bigint>;
```

Defined in: [packages/sdk/src/bond/client.ts:104](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L104)

Stake currently in the unstake-cooldown window.

#### Returns

`Promise`&lt;`bigint`&gt;

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`pendingUnstake`](../../index/interfaces/BondClientHandle.md#pendingunstake)

***

### requestUnstake()

```ts
requestUnstake(amount): Promise<`0x${string}`>;
```

Defined in: [packages/sdk/src/bond/client.ts:156](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L156)

Begin the unstake cooldown for `amount`. Returns the tx hash.

#### Parameters

##### amount

`bigint`

#### Returns

`Promise`&lt;`` `0x$&#123;string&#125;` ``&gt;

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`requestUnstake`](../../index/interfaces/BondClientHandle.md#requestunstake)

***

### slashedTotal()

```ts
slashedTotal(): Promise<bigint>;
```

Defined in: [packages/sdk/src/bond/client.ts:112](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L112)

Global slashed amount across ALL fillers on this bond contract — useful
for monitoring + UI badges. Per-filler / per-staker slashing isn't
tracked at the contract level (v0 design).

#### Returns

`Promise`&lt;`bigint`&gt;

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`slashedTotal`](../../index/interfaces/BondClientHandle.md#slashedtotal)

***

### stake()

```ts
stake(amount): Promise<`0x${string}`>;
```

Defined in: [packages/sdk/src/bond/client.ts:136](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L136)

Stake ETH to back `fillerContract`. Returns the tx hash.

#### Parameters

##### amount

`bigint`

#### Returns

`Promise`&lt;`` `0x$&#123;string&#125;` ``&gt;

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`stake`](../../index/interfaces/BondClientHandle.md#stake)

***

### totalStake()

```ts
totalStake(): Promise<bigint>;
```

Defined in: [packages/sdk/src/bond/client.ts:92](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L92)

Stake total for `(fillerContract, account)` (active + pending unstake).

#### Returns

`Promise`&lt;`bigint`&gt;

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`totalStake`](../../index/interfaces/BondClientHandle.md#totalstake)

***

### waitAndWithdraw()

```ts
waitAndWithdraw(opts?): Promise<`0x${string}`>;
```

Defined in: [packages/sdk/src/bond/client.ts:230](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L230)

Convenience: block until the cooldown has elapsed (with a small buffer)
then call `withdraw()`. Throws if there's no pending unstake to withdraw.

**Defensive cap (max wait):** caller can pass `maxWaitMs` to bound how
long we'll sleep — useful for CI / tests that don't want to actually
wait 7 days. Defaults to `Infinity` (wait as long as the contract says).

#### Parameters

##### opts?

###### maxWaitMs?

`number`

#### Returns

`Promise`&lt;`` `0x$&#123;string&#125;` ``&gt;

***

### withdraw()

```ts
withdraw(): Promise<`0x${string}`>;
```

Defined in: [packages/sdk/src/bond/client.ts:189](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L189)

After cooldown, withdraw the unstaked amount. Returns the tx hash.

#### Returns

`Promise`&lt;`` `0x$&#123;string&#125;` ``&gt;

#### Implementation of

[`BondClientHandle`](../../index/interfaces/BondClientHandle.md).[`withdraw`](../../index/interfaces/BondClientHandle.md#withdraw)

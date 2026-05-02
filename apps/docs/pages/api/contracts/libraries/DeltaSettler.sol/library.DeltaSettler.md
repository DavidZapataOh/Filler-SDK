# DeltaSettler
[Git Source](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/src/libraries/DeltaSettler.sol)

**Title:**
DeltaSettler

Library for netting v4 currency deltas to zero from inside an unlock callback.

Mirrors the canonical pattern from `v4-periphery/src/base/DeltaResolver.sol` but
packaged as a library so it can be reused by the Filler contract without inheritance.
Negative delta (caller owes pool):
- Native: `poolManager.settle{value: amount}()`
- ERC20:  `sync(currency)` → `transfer to poolManager` → `settle()`
Positive delta (pool owes caller):
- `poolManager.take(currency, address(this), amount)`
Functions are `internal`, which inlines them into the calling contract.
This means `address(this)` resolves to the caller — exactly what we want.


## Functions
### settleAll

Settle (or take) deltas for both currencies of a pool, in order.


```solidity
function settleAll(
    IPoolManager poolManager,
    PoolKey memory key
) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolManager`|`IPoolManager`|The v4 PoolManager.|
|`key`|`PoolKey`|The pool whose currencies are being settled.|


### _settleOrTake

Settle a single currency: pays if negative, takes if positive, no-op if zero.


```solidity
function _settleOrTake(
    IPoolManager poolManager,
    Currency currency
) private;
```


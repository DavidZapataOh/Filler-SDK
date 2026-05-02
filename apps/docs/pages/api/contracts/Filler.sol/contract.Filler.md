# Filler
[Git Source](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/src/Filler.sol)

**Inherits:**
IReactorCallback, IUnlockCallback, Ownable

**Title:**
Filler — UniswapX vertical filler with atomic JIT pattern

**Author:**
Filler SDK Contributors

Receives intents from UniswapX Reactor, fills them by providing
just-in-time liquidity to a v4 pool, swapping through it, and
reclaiming the liquidity in the same transaction.

IMMUTABLE — no upgradeability. New deployments + migration only.
See: docs/adr/0001-immutable-contracts.md


## State Variables
### REACTOR
The UniswapX Reactor authorized to call this filler.


```solidity
IReactor public immutable REACTOR
```


### POOL_MANAGER
The Uniswap v4 PoolManager.


```solidity
IPoolManager public immutable POOL_MANAGER
```


### BOND
The associated Bond contract (informational; slashing logic lives there).


```solidity
address public immutable BOND
```


### approvalsConfigured
One-time setup flag. Once true, approvals cannot be re-applied.


```solidity
bool public approvalsConfigured
```


### allowedCurrencies
Whitelisted currencies that the filler will operate on.

Currencies must be standard ERC20 (no rebasing, no fee-on-transfer) or native ETH.


```solidity
mapping(Currency currency => bool allowed) public allowedCurrencies
```


### locked
Transient reentrancy guard (Solidity 0.8.28+ transient storage).


```solidity
bool transient locked
```


## Functions
### onlyReactor


```solidity
modifier onlyReactor() ;
```

### onlyPoolManager


```solidity
modifier onlyPoolManager() ;
```

### nonReentrant

Reset within the same tx so subsequent external calls can re-enter the contract
through a different nonReentrant function. Transient storage clears between txs
automatically — this reset only matters for sequential calls in one tx.


```solidity
modifier nonReentrant() ;
```

### _onlyReactor


```solidity
function _onlyReactor() internal view;
```

### _onlyPoolManager


```solidity
function _onlyPoolManager() internal view;
```

### _enterReentrancyGuard


```solidity
function _enterReentrancyGuard() internal;
```

### _exitReentrancyGuard


```solidity
function _exitReentrancyGuard() internal;
```

### constructor


```solidity
constructor(
    IReactor _reactor,
    IPoolManager _poolManager,
    address _bond
) ;
```

### receive

Accepts native ETH from PoolManager (`take`) or Reactor (ETH outputs).


```solidity
receive() external payable;
```

### configureApprovals

One-time setup: approve PoolManager + Reactor for whitelisted currencies.

After calling this, ownership can be renounced for trust-minimization.


```solidity
function configureApprovals(
    Currency[] calldata currencies
) external onlyOwner;
```

### execute

Execute a single signed order through the configured Reactor.

Solver bots call this method instead of `Reactor.executeWithCallback` directly,
so that `msg.sender` to the reactor is THIS contract — making the Filler the
`fillContract` per UniswapX v2.1 semantics. The reactor will then call back into
`Filler.reactorCallback` with the resolved order. `msg.value` is forwarded so
reactors that require an ETH bond on execute (e.g., V2DutchOrderReactor protocol
fees) keep working.


```solidity
function execute(
    SignedOrder calldata order,
    bytes calldata callbackData
) external payable;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`order`|`SignedOrder`|The signed UniswapX order to fill.|
|`callbackData`|`bytes`|ABI-encoded `FillParams[]` of length 1 — passed unchanged to the reactor and back into `reactorCallback`.|


### executeBatch

Execute a batch of signed orders. Reactor receives all of them and calls
this filler's `reactorCallback` once with the full resolved batch.


```solidity
function executeBatch(
    SignedOrder[] calldata orders,
    bytes calldata callbackData
) external payable;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`orders`|`SignedOrder[]`|The signed UniswapX orders to fill.|
|`callbackData`|`bytes`|ABI-encoded `FillParams[]` matching `orders` length.|


### reactorCallback

Called by UniswapX Reactor after transferring input tokens to this filler.

Must end with output tokens approved to the Reactor for transferFrom.
Interface mandates `memory` parameters (see IReactorCallback).


```solidity
function reactorCallback(
    ResolvedOrder[] memory resolvedOrders,
    bytes memory callbackData
) external onlyReactor nonReentrant;
```

### _processOrder


```solidity
function _processOrder(
    ResolvedOrder memory order,
    FillParams memory p
) internal;
```

### unlockCallback

Called by PoolManager during `unlock()`. Executes the JIT pattern atomically.

Must settle every currency delta to zero before returning.


```solidity
function unlockCallback(
    bytes calldata data
) external onlyPoolManager returns (bytes memory);
```

### _addJitLiquidity


```solidity
function _addJitLiquidity(
    FillParams memory p
) internal;
```

### _swap


```solidity
function _swap(
    FillParams memory p
) internal returns (BalanceDelta);
```

### _removeJitLiquidity


```solidity
function _removeJitLiquidity(
    FillParams memory p
) internal;
```

### _assertDeltasZero


```solidity
function _assertDeltasZero(
    FillParams memory p
) internal view;
```

### quotedFillFor

Pre-flight check used by off-chain solvers: would this fill validate?


```solidity
function quotedFillFor(
    FillParams calldata p
) external view returns (bool ok, bytes memory reason);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`ok`|`bool`|True if validation would pass.|
|`reason`|`bytes`|Empty when ok; raw revert bytes from `validate()` otherwise.|


### validateExternal

External wrapper around `FillParams.validate()` so it can be `try/catch`-ed.


```solidity
function validateExternal(
    FillParams calldata p
) external view;
```

### allowCurrency

Add a currency to the whitelist post-setup.

Operational only — fill logic is immutable.


```solidity
function allowCurrency(
    Currency currency
) external onlyOwner;
```

### disallowCurrency

Remove a currency from the whitelist + revoke approvals.


```solidity
function disallowCurrency(
    Currency currency
) external onlyOwner;
```

## Events
### Filled

```solidity
event Filled(
    bytes32 indexed orderHash,
    address indexed user,
    Currency indexed inputCurrency,
    Currency outputCurrency,
    uint256 inputAmount,
    uint256 outputAmount,
    uint256 feesCaptured
);
```

### ApprovalsConfigured

```solidity
event ApprovalsConfigured(uint256 currencyCount);
```

### CurrencyAllowed

```solidity
event CurrencyAllowed(Currency indexed currency);
```

### CurrencyDisallowed

```solidity
event CurrencyDisallowed(Currency indexed currency);
```


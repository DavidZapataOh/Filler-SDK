// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/libraries/TransientStateLibrary.sol";

/// @title DeltaSettler
/// @notice Library for netting v4 currency deltas to zero from inside an unlock callback.
/// @dev Mirrors the canonical pattern from `v4-periphery/src/base/DeltaResolver.sol` but
///      packaged as a library so it can be reused by the Filler contract without inheritance.
///
///      Negative delta (caller owes pool):
///        - Native: `poolManager.settle{value: amount}()`
///        - ERC20:  `sync(currency)` → `transfer to poolManager` → `settle()`
///
///      Positive delta (pool owes caller):
///        - `poolManager.take(currency, address(this), amount)`
///
///      Functions are `internal`, which inlines them into the calling contract.
///      This means `address(this)` resolves to the caller — exactly what we want.
library DeltaSettler {
    using TransientStateLibrary for IPoolManager;
    using CurrencyLibrary for Currency;

    /// @notice Settle (or take) deltas for both currencies of a pool, in order.
    /// @param poolManager The v4 PoolManager.
    /// @param key The pool whose currencies are being settled.
    function settleAll(
        IPoolManager poolManager,
        PoolKey memory key
    ) internal {
        _settleOrTake(poolManager, key.currency0);
        _settleOrTake(poolManager, key.currency1);
    }

    /// @notice Settle a single currency: pays if negative, takes if positive, no-op if zero.
    function _settleOrTake(
        IPoolManager poolManager,
        Currency currency
    ) private {
        int256 delta = poolManager.currencyDelta(address(this), currency);

        if (delta < 0) {
            // Branch guards delta < 0; -delta fits in (0, 2^255], safe to cast to uint256.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 amount = uint256(-delta);
            if (currency.isAddressZero()) {
                // Native ETH path: amount determined by msg.value; sync is not required.
                poolManager.settle{value: amount}();
            } else {
                // ERC20 path: sync reserves, push tokens to manager, then settle.
                poolManager.sync(currency);
                currency.transfer(address(poolManager), amount);
                poolManager.settle();
            }
        } else if (delta > 0) {
            // Casting delta to uint256 is safe: branch guards delta > 0, so delta fits in uint256.
            // forge-lint: disable-next-line(unsafe-typecast)
            poolManager.take(currency, address(this), uint256(delta));
        }
        // delta == 0: nothing owed in either direction.
    }
}

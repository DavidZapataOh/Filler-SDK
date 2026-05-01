// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";

import {FillParams} from "../../src/libraries/FillParams.sol";

/// @notice Test fixtures for sprint-01 unit tests.
/// @dev Centralizes valid-by-construction `FillParams` so individual tests can mutate
///      one field at a time and prove the negative path.
library Fixtures {
    /// @dev Currency0 must compare strictly less than currency1 by `address`.
    address internal constant TOKEN0_ADDR = address(0x0000000000000000000000000000000000001111);
    address internal constant TOKEN1_ADDR = address(0x0000000000000000000000000000000000002222);

    int24 internal constant TICK_SPACING = 60;
    int24 internal constant TICK_LOWER = -600;
    int24 internal constant TICK_UPPER = 600;

    /// @notice Returns a well-formed `FillParams` for the canonical TOKEN0 → TOKEN1 swap.
    /// @dev `deadline` is 1 day after `block.timestamp`; tests can override to test edge cases.
    function validParams() internal view returns (FillParams memory p) {
        Currency c0 = Currency.wrap(TOKEN0_ADDR);
        Currency c1 = Currency.wrap(TOKEN1_ADDR);

        p = FillParams({
            poolKey: PoolKey({
                currency0: c0,
                currency1: c1,
                fee: 3000,
                tickSpacing: TICK_SPACING,
                hooks: IHooks(address(0))
            }),
            inputCurrency: c0,
            outputCurrency: c1,
            inputAmount: 1 ether,
            outputAmount: 0.99 ether,
            zeroForOne: true,
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            liquidityDelta: 1e18,
            feesCaptured: 0,
            deadline: block.timestamp + 1 days
        });
    }
}

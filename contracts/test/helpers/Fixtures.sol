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
        return
            validParamsFor(
                Currency.wrap(TOKEN0_ADDR), Currency.wrap(TOKEN1_ADDR), 1 ether, 0.99 ether
            );
    }

    /// @notice Returns a well-formed `FillParams` parameterized by currencies and amounts.
    /// @dev Direction defaults to `zeroForOne = true` (input = c0, output = c1).
    ///      Caller MUST pass currencies in canonical order (`Currency.unwrap(c0) <
    /// Currency.unwrap(c1)`).
    function validParamsFor(
        Currency c0,
        Currency c1,
        uint256 inputAmount,
        uint256 outputAmount
    ) internal view returns (FillParams memory p) {
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
            inputAmount: inputAmount,
            outputAmount: outputAmount,
            zeroForOne: true,
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            liquidityDelta: 1e18,
            feesCaptured: 0,
            deadline: block.timestamp + 1 days
        });
    }

    /// @notice Returns a `FillParams` with `zeroForOne = false` (currencies flipped to match).
    function validParamsOneForZero(
        Currency c0,
        Currency c1,
        uint256 inputAmount,
        uint256 outputAmount
    ) internal view returns (FillParams memory p) {
        p = validParamsFor(c0, c1, inputAmount, outputAmount);
        p.zeroForOne = false;
        // For oneForZero, input is c1 and output is c0.
        p.inputCurrency = c1;
        p.outputCurrency = c0;
    }
}

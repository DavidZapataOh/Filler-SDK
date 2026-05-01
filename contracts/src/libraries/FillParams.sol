// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/libraries/TickMath.sol";

import {InvalidFillParams} from "../errors/Errors.sol";

/// @notice Parameters for a single fill, calculated off-chain by the SDK.
/// @dev Off-chain SDK computes optimal tickLower / tickUpper / liquidityDelta and
///      packages them into this struct, signed and submitted via UniswapX Reactor.
///      All fields are validated on-chain in `FillParamsLib.validate()`.
struct FillParams {
    /// @notice The v4 pool to route the swap through.
    PoolKey poolKey;
    /// @notice The currency the user is sending in (input).
    Currency inputCurrency;
    /// @notice The currency the user wants out (output).
    Currency outputCurrency;
    /// @notice Amount of inputCurrency the user is providing.
    uint256 inputAmount;
    /// @notice Minimum amount of outputCurrency the user expects.
    uint256 outputAmount;
    /// @notice Direction of the swap through the pool (currency0 → currency1?).
    bool zeroForOne;
    /// @notice Lower bound of the JIT liquidity range (must align to tickSpacing).
    int24 tickLower;
    /// @notice Upper bound of the JIT liquidity range.
    int24 tickUpper;
    /// @notice Liquidity to add (and later remove) for JIT.
    uint128 liquidityDelta;
    /// @notice Estimated fees captured by JIT (used in events for analytics).
    uint256 feesCaptured;
    /// @notice Deadline beyond which fill is invalid.
    uint256 deadline;
}

library FillParamsLib {
    /// @notice Validates that fill params are well-formed.
    /// @dev Reverts with `InvalidFillParams` on any check failure.
    function validate(
        FillParams memory p
    ) internal view {
        // Deadline must be in future
        if (p.deadline < block.timestamp) revert InvalidFillParams();

        // Tick range must be valid
        if (p.tickLower >= p.tickUpper) revert InvalidFillParams();
        if (p.tickLower < TickMath.MIN_TICK) revert InvalidFillParams();
        if (p.tickUpper > TickMath.MAX_TICK) revert InvalidFillParams();

        // Tick spacing alignment
        if (p.tickLower % p.poolKey.tickSpacing != 0) revert InvalidFillParams();
        if (p.tickUpper % p.poolKey.tickSpacing != 0) revert InvalidFillParams();

        // Amounts must be positive
        if (p.liquidityDelta == 0) revert InvalidFillParams();
        if (p.inputAmount == 0) revert InvalidFillParams();
        if (p.outputAmount == 0) revert InvalidFillParams();

        // Input/output currencies must match poolKey + zeroForOne direction
        if (p.zeroForOne) {
            if (Currency.unwrap(p.inputCurrency) != Currency.unwrap(p.poolKey.currency0)) {
                revert InvalidFillParams();
            }
            if (Currency.unwrap(p.outputCurrency) != Currency.unwrap(p.poolKey.currency1)) {
                revert InvalidFillParams();
            }
        } else {
            if (Currency.unwrap(p.inputCurrency) != Currency.unwrap(p.poolKey.currency1)) {
                revert InvalidFillParams();
            }
            if (Currency.unwrap(p.outputCurrency) != Currency.unwrap(p.poolKey.currency0)) {
                revert InvalidFillParams();
            }
        }
    }
}

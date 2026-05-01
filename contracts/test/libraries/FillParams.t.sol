// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TickMath} from "@uniswap/v4-core/libraries/TickMath.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";

import {FillParams, FillParamsLib} from "../../src/libraries/FillParams.sol";
import {InvalidFillParams} from "../../src/errors/Errors.sol";

import {Fixtures} from "../helpers/Fixtures.sol";

/// @title FillParamsTest
/// @notice Branch-by-branch coverage for `FillParamsLib.validate`.
/// @dev Every revert branch in `validate()` has a corresponding negative test;
///      `testFuzz_*` covers the broader value spaces beyond the unit cases.
///      `validate()` is an internal library function. `vm.expectRevert` only matches
///      reverts that happen at a depth STRICTLY DEEPER than the cheatcode call frame,
///      so we route through an external wrapper (`this.callValidate(p)`).
contract FillParamsTest is Test {
    using FillParamsLib for FillParams;

    /// @dev External wrapper so `vm.expectRevert` sees the revert at a deeper call frame.
    function callValidate(
        FillParams calldata p
    ) external view {
        FillParamsLib.validate(p);
    }

    function _expectInvalid(
        FillParams memory p
    ) internal {
        vm.expectRevert(InvalidFillParams.selector);
        this.callValidate(p);
    }

    // ============ Happy path ============

    function test_validate_succeedsForCanonicalParams() public view {
        FillParams memory p = Fixtures.validParams();
        p.validate();
    }

    function test_validate_succeedsForOneForZero() public view {
        FillParams memory p = Fixtures.validParams();
        p.zeroForOne = false;
        // Flip currencies to match direction.
        (p.inputCurrency, p.outputCurrency) = (p.outputCurrency, p.inputCurrency);
        p.validate();
    }

    // ============ Deadline ============

    function test_validate_revertsWhenDeadlineInPast() public {
        FillParams memory p = Fixtures.validParams();
        p.deadline = block.timestamp - 1;
        _expectInvalid(p);
    }

    function test_validate_acceptsDeadlineExactlyNow() public view {
        FillParams memory p = Fixtures.validParams();
        p.deadline = block.timestamp;
        // Spec: `deadline < block.timestamp` reverts. Exactly equal is still valid.
        p.validate();
    }

    // ============ Tick range ============

    function test_validate_revertsWhenTicksInverted() public {
        FillParams memory p = Fixtures.validParams();
        (p.tickLower, p.tickUpper) = (p.tickUpper, p.tickLower);
        _expectInvalid(p);
    }

    function test_validate_revertsWhenTicksEqual() public {
        FillParams memory p = Fixtures.validParams();
        p.tickUpper = p.tickLower;
        _expectInvalid(p);
    }

    function test_validate_revertsWhenTickLowerBelowMin() public {
        FillParams memory p = Fixtures.validParams();
        // MIN_TICK is not aligned to tickSpacing 60, so this also fails alignment.
        // We pick a value strictly less than MIN_TICK aligned to tickSpacing to isolate the bound
        // check. MIN_TICK = -887272; the next multiple of 60 below is -887280.
        p.tickLower = -887_280;
        _expectInvalid(p);
    }

    function test_validate_revertsWhenTickUpperAboveMax() public {
        FillParams memory p = Fixtures.validParams();
        // MAX_TICK = 887272; next multiple of 60 above is 887280.
        p.tickUpper = 887_280;
        _expectInvalid(p);
    }

    // ============ Tick spacing alignment ============

    function test_validate_revertsWhenTickLowerUnaligned() public {
        FillParams memory p = Fixtures.validParams();
        p.tickLower = p.tickLower + 1;
        _expectInvalid(p);
    }

    function test_validate_revertsWhenTickUpperUnaligned() public {
        FillParams memory p = Fixtures.validParams();
        p.tickUpper = p.tickUpper + 1;
        _expectInvalid(p);
    }

    // ============ Amounts ============

    function test_validate_revertsWhenLiquidityDeltaZero() public {
        FillParams memory p = Fixtures.validParams();
        p.liquidityDelta = 0;
        _expectInvalid(p);
    }

    function test_validate_revertsWhenInputAmountZero() public {
        FillParams memory p = Fixtures.validParams();
        p.inputAmount = 0;
        _expectInvalid(p);
    }

    function test_validate_revertsWhenOutputAmountZero() public {
        FillParams memory p = Fixtures.validParams();
        p.outputAmount = 0;
        _expectInvalid(p);
    }

    // ============ Currency direction (zeroForOne = true) ============

    function test_validate_revertsWhenZeroForOneInputIsCurrency1() public {
        FillParams memory p = Fixtures.validParams();
        // zeroForOne = true requires inputCurrency == currency0. Set it to currency1 instead.
        p.inputCurrency = p.poolKey.currency1;
        _expectInvalid(p);
    }

    function test_validate_revertsWhenZeroForOneOutputIsCurrency0() public {
        FillParams memory p = Fixtures.validParams();
        // zeroForOne = true requires outputCurrency == currency1. Set it to currency0.
        p.outputCurrency = p.poolKey.currency0;
        _expectInvalid(p);
    }

    // ============ Currency direction (zeroForOne = false) ============

    function test_validate_revertsWhenOneForZeroInputIsCurrency0() public {
        FillParams memory p = Fixtures.validParams();
        p.zeroForOne = false;
        // After flipping the direction we DO swap currencies; here we keep input=currency0
        // (which is wrong for zeroForOne=false, the input must be currency1).
        p.outputCurrency = p.poolKey.currency0;
        _expectInvalid(p);
    }

    function test_validate_revertsWhenOneForZeroOutputIsCurrency1() public {
        FillParams memory p = Fixtures.validParams();
        p.zeroForOne = false;
        p.inputCurrency = p.poolKey.currency1;
        // outputCurrency still equals currency1 from validParams() — wrong for zeroForOne=false.
        _expectInvalid(p);
    }

    // ============ Generic mismatch (currencies completely unrelated to pool) ============

    function test_validate_revertsWhenCurrenciesUnrelatedToPool() public {
        FillParams memory p = Fixtures.validParams();
        p.inputCurrency = Currency.wrap(address(0xDEAD));
        _expectInvalid(p);
    }

    // ============ Fuzz ============

    /// @notice Validate accepts any tick range that is aligned + ordered + within bounds.
    function testFuzz_validate_acceptsValidTickRanges(
        int24 lowerSeed,
        int24 upperSeed
    ) public view {
        // Constrain to legal aligned-to-tickSpacing range.
        int24 spacing = Fixtures.TICK_SPACING;
        // Round MIN/MAX_TICK toward zero to the nearest tickSpacing multiple — the
        // multiplication after the divide IS the snap-to-grid; precision loss is intended.
        // forge-lint: disable-next-line(divide-before-multiply)
        int24 minAligned = (TickMath.MIN_TICK / spacing) * spacing;
        if (minAligned < TickMath.MIN_TICK) minAligned += spacing;
        // forge-lint: disable-next-line(divide-before-multiply)
        int24 maxAligned = (TickMath.MAX_TICK / spacing) * spacing;

        int24 lower = int24(bound(lowerSeed, minAligned, maxAligned - spacing));
        // Snap to grid: integer truncation is the *desired* semantic here.
        // forge-lint: disable-next-line(divide-before-multiply)
        lower = (lower / spacing) * spacing;
        int24 upper = int24(bound(upperSeed, lower + spacing, maxAligned));
        // forge-lint: disable-next-line(divide-before-multiply)
        upper = (upper / spacing) * spacing;
        if (upper <= lower) upper = lower + spacing;

        FillParams memory p = Fixtures.validParams();
        p.tickLower = lower;
        p.tickUpper = upper;
        p.validate();
    }

    /// @notice Validate rejects any deadline strictly in the past, no matter how far back.
    function testFuzz_validate_rejectsAnyPastDeadline(
        uint256 secondsBack
    ) public {
        secondsBack = bound(secondsBack, 1, block.timestamp);
        FillParams memory p = Fixtures.validParams();
        p.deadline = block.timestamp - secondsBack;
        _expectInvalid(p);
    }

    /// @notice Validate rejects any non-zero offset away from tickSpacing alignment.
    function testFuzz_validate_rejectsAnyTickMisalignment(
        int24 lowerOffset
    ) public {
        int24 spacing = Fixtures.TICK_SPACING;
        // Offset in (-spacing, spacing) excluding zero.
        int24 offset = int24(bound(lowerOffset, -(spacing - 1), spacing - 1));
        if (offset == 0) offset = 1;

        FillParams memory p = Fixtures.validParams();
        p.tickLower = p.tickLower + offset;
        _expectInvalid(p);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {ResolvedOrder} from "@uniswap/uniswapx/base/ReactorStructs.sol";

import {Filler} from "../../src/Filler.sol";
import {NotReactor, NotPoolManager} from "../../src/errors/Errors.sol";

/// @title HalmosFillerAccess
/// @notice Symbolic-execution proofs that the Filler's access control holds for
///         EVERY possible caller. Halmos explores all `address` inputs; the assertions
///         must hold for the entire input space.
/// @dev Run: `halmos --contract HalmosFillerAccess`. These proofs deliberately do NOT
///      simulate the full v4 + UniswapX call graph (Halmos cannot meaningfully reason
///      across that many opaque external contracts). They focus on the parts that ARE
///      tractable for symbolic execution: the modifier checks at the Filler boundary.
// Halmos recognises symbolic-execution properties by their `check_` prefix; the snake-case
// suffixes are mandated by the framework and conflict with mixedCase. Disable that lint
// across the whole file.
// forge-lint: disable-start(mixed-case-function)
contract HalmosFillerAccess is Test {
    Filler public filler;
    address public reactor = address(0x1111111111111111111111111111111111111111);
    address public poolManager = address(0x2222222222222222222222222222222222222222);
    address public bond = address(0x3333333333333333333333333333333333333333);

    function setUp() public {
        filler = new Filler(IReactor(reactor), IPoolManager(poolManager), bond);
    }

    /// @notice ∀ caller ≠ REACTOR, calling `reactorCallback` reverts with `NotReactor(caller)`.
    /// @dev Halmos symbolises `caller`. The assume guards out the legitimate path; the
    ///      remaining infinite address space MUST revert with the correct selector.
    function check_reactorCallback_revertsForEveryNonReactor(
        address caller
    ) public {
        vm.assume(caller != reactor);

        ResolvedOrder[] memory empty = new ResolvedOrder[](0);
        vm.prank(caller);
        try filler.reactorCallback(empty, "") {
            assert(false); // unreachable: must revert
        } catch (bytes memory err) {
            // Selector must match `NotReactor(address)`. Truncating revert data to its 4-byte
            // selector is the standard pattern; `err` is at minimum 4 bytes when present.
            // forge-lint: disable-next-line(unsafe-typecast)
            bytes4 sel = bytes4(err);
            assert(sel == NotReactor.selector);
        }
    }

    /// @notice ∀ caller ≠ POOL_MANAGER, calling `unlockCallback` reverts with
    /// `NotPoolManager(caller)`.
    function check_unlockCallback_revertsForEveryNonPoolManager(
        address caller
    ) public {
        vm.assume(caller != poolManager);

        vm.prank(caller);
        try filler.unlockCallback("") {
            assert(false); // unreachable: must revert
        } catch (bytes memory err) {
            // forge-lint: disable-next-line(unsafe-typecast)
            bytes4 sel = bytes4(err);
            assert(sel == NotPoolManager.selector);
        }
    }

    /// @notice ∀ caller ≠ owner, `configureApprovals` reverts (Solady `Unauthorized()`).
    /// @dev We do NOT assert the specific selector here — Solady's `Unauthorized()` is the
    ///      contract one chosen for owner-only revert paths. Asserting "the call reverts"
    ///      is the formal property; the selector identity is asserted in unit tests.
    function check_configureApprovals_revertsForEveryNonOwner(
        address caller
    ) public {
        vm.assume(caller != filler.owner());

        Currency[] memory empty = new Currency[](0);
        vm.prank(caller);
        try filler.configureApprovals(empty) {
            assert(false);
        } catch {
            // expected — onlyOwner guard.
        }
    }

    /// @notice ∀ caller ≠ owner, `allowCurrency` reverts.
    function check_allowCurrency_revertsForEveryNonOwner(
        address caller,
        Currency c
    ) public {
        vm.assume(caller != filler.owner());

        vm.prank(caller);
        try filler.allowCurrency(c) {
            assert(false);
        } catch {
            // expected
        }
    }

    /// @notice ∀ caller ≠ owner, `disallowCurrency` reverts.
    function check_disallowCurrency_revertsForEveryNonOwner(
        address caller,
        Currency c
    ) public {
        vm.assume(caller != filler.owner());

        vm.prank(caller);
        try filler.disallowCurrency(c) {
            assert(false);
        } catch {
            // expected
        }
    }

    /// @notice After construction, REACTOR / POOL_MANAGER / BOND are exactly the constructor args
    ///         and approvalsConfigured is false. Captures the initial-state invariant Halmos
    ///         can prove WITHOUT exploring any further state transitions.
    function check_constructorState_isCorrect() public view {
        assert(address(filler.REACTOR()) == reactor);
        assert(address(filler.POOL_MANAGER()) == poolManager);
        assert(filler.BOND() == bond);
        assert(filler.approvalsConfigured() == false);
    }
}
// forge-lint: disable-end(mixed-case-function)

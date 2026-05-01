// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {FillerBond} from "../../src/FillerBond.sol";
import {
    NotEnoughStake,
    CooldownNotElapsed,
    AlreadySlashed,
    NoUnstakeRequest,
    DirectETHRejected
} from "../../src/errors/Errors.sol";

/// @title HalmosBondInvariants
/// @notice Symbolic-execution proofs for `FillerBond.sol` invariants.
/// @dev Run: `halmos --contract HalmosBondInvariants`. Each `check_*` is proved over the
///      symbolic input space — Halmos guarantees the property for ALL inputs that satisfy
///      the `vm.assume` preconditions.
// forge-lint: disable-start(mixed-case-function)
contract HalmosBondInvariants is Test {
    FillerBond public bond;
    address public treasury = address(0xCAFE);
    address public reactorAddr = address(0xBEEF);

    function setUp() public {
        bond = new FillerBond(treasury, reactorAddr);
    }

    /// @notice ∀ stake amount > 0, after `stake` the bond's ETH balance is ≥ totalStaked.
    /// @dev Captures the solvency invariant after a single state transition.
    function check_solvency_holds_after_stake(
        address staker,
        address filler,
        uint128 amount
    ) public {
        vm.assume(staker != address(0) && filler != address(0));
        vm.assume(amount > 0);

        vm.deal(staker, amount);
        vm.prank(staker);
        bond.stake{value: amount}(filler);

        assert(address(bond).balance >= bond.totalStaked());
    }

    /// @notice ∀ valid cooldown < 7 days, `withdraw` reverts with `CooldownNotElapsed`.
    /// @dev The most security-relevant time check. Halmos symbolises both the stake amount
    ///      and the elapsed time; the assertion holds for the entire `[0, 7 days)` window.
    function check_withdraw_revertsBeforeCooldown(
        address staker,
        address filler,
        uint96 amount,
        uint64 timeShift
    ) public {
        vm.assume(staker != address(0) && filler != address(0));
        vm.assume(amount > 0);
        vm.assume(timeShift < 7 days);

        vm.deal(staker, amount);
        vm.prank(staker);
        bond.stake{value: amount}(filler);

        vm.prank(staker);
        bond.requestUnstake(filler, amount);

        skip(timeShift);

        vm.prank(staker);
        try bond.withdraw(filler) {
            assert(false); // unreachable: cooldown not elapsed
        } catch (bytes memory err) {
            // forge-lint: disable-next-line(unsafe-typecast)
            bytes4 sel = bytes4(err);
            assert(sel == CooldownNotElapsed.selector);
        }
    }

    /// @notice ∀ first slash with evidence E, a second slash with the same E reverts with
    ///         `AlreadySlashed`. Captures the set-once invariant on `slashedEvidence`.
    function check_slash_doublespend_blocked(
        address filler,
        uint96 stakeAmount,
        uint64 firstSlash,
        bytes32 evidence
    ) public {
        vm.assume(filler != address(0));
        vm.assume(stakeAmount > 0);
        vm.assume(firstSlash > 0 && firstSlash <= stakeAmount);

        vm.deal(address(this), stakeAmount);
        bond.stake{value: stakeAmount}(filler);

        bond.slash(filler, firstSlash, evidence);

        try bond.slash(filler, 1, evidence) {
            assert(false); // unreachable: same evidence used twice
        } catch (bytes memory err) {
            // forge-lint: disable-next-line(unsafe-typecast)
            bytes4 sel = bytes4(err);
            assert(sel == AlreadySlashed.selector);
        }
    }

    /// @notice ∀ caller without a pending unstake, `withdraw` reverts with `NoUnstakeRequest`.
    function check_withdraw_revertsWithoutRequest(
        address staker,
        address filler
    ) public {
        vm.assume(staker != address(0) && filler != address(0));

        vm.prank(staker);
        try bond.withdraw(filler) {
            assert(false);
        } catch (bytes memory err) {
            // forge-lint: disable-next-line(unsafe-typecast)
            bytes4 sel = bytes4(err);
            assert(sel == NoUnstakeRequest.selector);
        }
    }

    /// @notice F-2 regression: ∀ slash that reduces `totalStakedFor[f]` below a staker's
    ///         individual `stakes[f][s].amount`, an unstake request for the staker's full
    ///         pre-slash amount reverts cleanly with `NotEnoughStake` (NOT `Panic(0x11)`).
    /// @dev This is the formal proof corresponding to the F-2 fix shipped in Plan 06.
    function check_F2_requestUnstake_revertsCleanlyAfterSlash(
        address staker,
        address other_,
        address filler,
        uint96 stakeAmount,
        uint96 slashAmount
    ) public {
        vm.assume(staker != address(0) && other_ != address(0) && filler != address(0));
        vm.assume(staker != other_);
        vm.assume(stakeAmount > 1); // need room to leave individual stake intact post-slash
        vm.assume(slashAmount > 0 && slashAmount < stakeAmount);

        // Two stakers each contribute `stakeAmount`; pool total = 2 * stakeAmount.
        vm.deal(staker, stakeAmount);
        vm.prank(staker);
        bond.stake{value: stakeAmount}(filler);

        vm.deal(other_, stakeAmount);
        vm.prank(other_);
        bond.stake{value: stakeAmount}(filler);

        // Slash brings pool below each individual stake.
        bond.slash(filler, uint256(stakeAmount) + uint256(slashAmount), bytes32(uint256(0xDEAD)));
        // pool now = 2*stakeAmount - (stakeAmount + slashAmount) = stakeAmount - slashAmount.
        // Each individual still shows `stakeAmount` (NOT decremented by v0 design).

        // First staker tries to unstake the original full amount. This was the F-2 panic
        // path; with the defensive cap it must revert cleanly with NotEnoughStake.
        vm.prank(staker);
        try bond.requestUnstake(filler, stakeAmount) {
            assert(false); // pool is too small to cover this — must revert
        } catch (bytes memory err) {
            // forge-lint: disable-next-line(unsafe-typecast)
            bytes4 sel = bytes4(err);
            assert(sel == NotEnoughStake.selector);
        }
    }

    /// @notice Direct ETH transfers always revert with `DirectETHRejected`.
    function check_directETH_alwaysReverts(
        address sender,
        uint96 amount
    ) public {
        vm.assume(sender != address(0));
        vm.assume(amount > 0);

        vm.deal(sender, amount);
        vm.prank(sender);
        (bool ok, bytes memory ret) = address(bond).call{value: amount}("");

        assert(!ok);
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes4 sel = bytes4(ret);
        assert(sel == DirectETHRejected.selector);
    }
}
// forge-lint: disable-end(mixed-case-function)

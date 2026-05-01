// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FillerBond} from "../src/FillerBond.sol";
import {
    NotEnoughStake,
    CooldownNotElapsed,
    NoUnstakeRequest,
    AlreadySlashed,
    ZeroStake,
    InvalidAddress,
    DirectETHRejected
} from "../src/errors/Errors.sol";

import {BondTestBase} from "./helpers/BondTestBase.sol";
import {MaliciousReceiver, IBondForReentry} from "./helpers/MaliciousReceiver.sol";

/// @title FillerBondTest
/// @notice Comprehensive unit tests for `FillerBond.sol` covering stake, unstake,
///         withdraw, slash, admin, and reentrancy paths.
contract FillerBondTest is BondTestBase {
    // ============ Deployment ============

    function test_deploy_storesImmutables() public view {
        assertEq(bond.REACTOR(), reactorAddr);
        assertEq(bond.treasury(), treasury);
        assertEq(bond.UNSTAKE_COOLDOWN(), 7 days);
        assertEq(bond.owner(), address(this));
    }

    function test_constructor_revertsOnZeroTreasury() public {
        vm.expectRevert(InvalidAddress.selector);
        new FillerBond(address(0), reactorAddr);
    }

    function test_constructor_revertsOnZeroReactor() public {
        vm.expectRevert(InvalidAddress.selector);
        new FillerBond(treasury, address(0));
    }

    // ============ Stake ============

    function test_stake_increasesBalanceAndTotals() public {
        _stake(staker, fillerAddr, 10 ether);

        assertEq(bond.stakeOf(fillerAddr, staker), 10 ether);
        assertEq(bond.totalStakedFor(fillerAddr), 10 ether);
        assertEq(bond.totalStaked(), 10 ether);
        assertEq(bond.totalEverStaked(), 10 ether);
        assertEq(address(bond).balance, 10 ether);
    }

    function test_stake_revertsOnZeroValue() public {
        vm.prank(staker);
        vm.expectRevert(ZeroStake.selector);
        bond.stake{value: 0}(fillerAddr);
    }

    function test_stake_revertsOnZeroFiller() public {
        vm.prank(staker);
        vm.expectRevert(InvalidAddress.selector);
        bond.stake{value: 1 ether}(address(0));
    }

    function test_stake_multipleStakersForSameFiller() public {
        _stake(staker, fillerAddr, 5 ether);
        _stake(other, fillerAddr, 3 ether);

        assertEq(bond.stakeOf(fillerAddr, staker), 5 ether);
        assertEq(bond.stakeOf(fillerAddr, other), 3 ether);
        assertEq(bond.totalStakedFor(fillerAddr), 8 ether);
    }

    function test_stake_sameStakerTwiceAccumulates() public {
        _stake(staker, fillerAddr, 4 ether);
        _stake(staker, fillerAddr, 6 ether);
        assertEq(bond.stakeOf(fillerAddr, staker), 10 ether);
    }

    function test_stake_directETH_reverts() public {
        vm.prank(staker);
        (bool ok, bytes memory ret) = address(bond).call{value: 1 ether}("");
        assertFalse(ok);
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes4 sel = bytes4(ret);
        assertEq(sel, DirectETHRejected.selector);
    }

    // ============ Unstake / withdraw ============

    function test_requestUnstake_decreasesActiveStake() public {
        _stake(staker, fillerAddr, 10 ether);

        vm.prank(staker);
        bond.requestUnstake(fillerAddr, 4 ether);

        assertEq(bond.stakeOf(fillerAddr, staker), 6 ether);
        assertEq(bond.totalStakedFor(fillerAddr), 6 ether);

        (uint256 pending, uint256 availableAt) = bond.pendingWithdrawal(fillerAddr, staker);
        assertEq(pending, 4 ether);
        assertEq(availableAt, block.timestamp + 7 days);
    }

    function test_requestUnstake_revertsOnZeroAmount() public {
        _stake(staker, fillerAddr, 1 ether);
        vm.prank(staker);
        vm.expectRevert(NotEnoughStake.selector);
        bond.requestUnstake(fillerAddr, 0);
    }

    function test_requestUnstake_revertsIfExceedsStake() public {
        _stake(staker, fillerAddr, 1 ether);
        vm.prank(staker);
        vm.expectRevert(NotEnoughStake.selector);
        bond.requestUnstake(fillerAddr, 2 ether);
    }

    /// @dev Regression for FEEDBACK F-2: post-slash, a staker whose individual
    ///      `stakes[f][s].amount` exceeds the post-slash `totalStakedFor[f]` previously
    ///      panicked on the underflow. With the defensive cap, the call reverts cleanly
    ///      with `NotEnoughStake`.
    function test_requestUnstake_revertsCleanlyAfterMultiStakerSlash() public {
        // Two stakers contribute 5 ether each; pool active = 10.
        _stake(staker, fillerAddr, 5 ether);
        _stake(other, fillerAddr, 5 ether);

        // Slash 4 of the 10 active. Pool drops to 6; individual stakes still show 5 each.
        bond.slash(fillerAddr, 4 ether, keccak256("post-slash-cap"));

        // First staker requests their full 5 ether — pool has only 6 left, this fits.
        vm.prank(staker);
        bond.requestUnstake(fillerAddr, 5 ether);
        // Pool now 1 ether; second staker still shows 5 ether of individual stake.

        // Second staker requesting 5 would underflow the pool — must revert with NotEnoughStake.
        vm.prank(other);
        vm.expectRevert(NotEnoughStake.selector);
        bond.requestUnstake(fillerAddr, 5 ether);

        // The defensive cap allows the second staker to recover what's left (1 ether).
        vm.prank(other);
        bond.requestUnstake(fillerAddr, 1 ether);
        assertEq(bond.totalStakedFor(fillerAddr), 0);
    }

    function test_withdraw_revertsBeforeCooldown() public {
        _stake(staker, fillerAddr, 5 ether);
        vm.prank(staker);
        bond.requestUnstake(fillerAddr, 5 ether);

        skip(6 days);

        vm.prank(staker);
        vm.expectRevert(CooldownNotElapsed.selector);
        bond.withdraw(fillerAddr);
    }

    function test_withdraw_succeedsAfterCooldown() public {
        _stake(staker, fillerAddr, 5 ether);
        vm.prank(staker);
        bond.requestUnstake(fillerAddr, 5 ether);

        skip(7 days + 1);

        uint256 before = staker.balance;
        vm.prank(staker);
        bond.withdraw(fillerAddr);

        assertEq(staker.balance, before + 5 ether);
        (uint256 pending,) = bond.pendingWithdrawal(fillerAddr, staker);
        assertEq(pending, 0);
    }

    function test_withdraw_revertsWithoutRequest() public {
        vm.prank(staker);
        vm.expectRevert(NoUnstakeRequest.selector);
        bond.withdraw(fillerAddr);
    }

    // ============ Slash ============

    function test_slash_transfersToTreasury() public {
        _stake(staker, fillerAddr, 10 ether);
        bytes32 evidence = keccak256("violation-1");

        bond.slash(fillerAddr, 3 ether, evidence);

        assertEq(bond.totalStakedFor(fillerAddr), 7 ether);
        assertEq(bond.totalStaked(), 7 ether);
        assertEq(bond.totalSlashed(), 3 ether);
        assertTrue(bond.slashedEvidence(evidence));
        assertEq(treasury.balance, 3 ether);
    }

    function test_slash_revertsOnDuplicateEvidence() public {
        _stake(staker, fillerAddr, 10 ether);
        bytes32 evidence = keccak256("violation-dup");

        bond.slash(fillerAddr, 1 ether, evidence);

        vm.expectRevert(AlreadySlashed.selector);
        bond.slash(fillerAddr, 1 ether, evidence);
    }

    function test_slash_revertsIfExceedsActiveStake() public {
        _stake(staker, fillerAddr, 10 ether);
        vm.expectRevert(NotEnoughStake.selector);
        bond.slash(fillerAddr, 11 ether, keccak256("oversize"));
    }

    function test_slash_revertsOnZeroAmount() public {
        _stake(staker, fillerAddr, 10 ether);
        vm.expectRevert(ZeroStake.selector);
        bond.slash(fillerAddr, 0, keccak256("zero"));
    }

    function test_slash_revertsForNonOwner() public {
        _stake(staker, fillerAddr, 10 ether);
        vm.prank(attacker);
        vm.expectRevert();
        bond.slash(fillerAddr, 1 ether, keccak256("non-owner"));
    }

    function test_slash_doesNotTouchCooldownAmounts() public {
        _stake(staker, fillerAddr, 10 ether);
        // Move 4 ether to cooldown.
        vm.prank(staker);
        bond.requestUnstake(fillerAddr, 4 ether);

        // Slashing 6 ether (the active remainder) succeeds.
        bond.slash(fillerAddr, 6 ether, keccak256("active-only"));
        assertEq(bond.totalStakedFor(fillerAddr), 0);

        // Cooldown amount still recoverable after the cooldown elapses.
        skip(7 days + 1);
        uint256 before = staker.balance;
        vm.prank(staker);
        bond.withdraw(fillerAddr);
        assertEq(staker.balance, before + 4 ether);
    }

    // ============ Reentrancy ============

    function test_withdraw_blocksReentrancy() public {
        // Deploy malicious receiver and seed it with ETH.
        MaliciousReceiver mal = new MaliciousReceiver(IBondForReentry(address(bond)), fillerAddr);
        vm.deal(address(mal), 5 ether);
        mal.stakeAndRequest(5 ether);

        skip(7 days + 1);

        // Attack: receive() re-enters bond.withdraw. Inner call hits Reentrancy().
        // Inner revert bubbles up through the safeTransferETH call frame, which causes
        // the outer transfer to fail. SafeTransferLib then reverts with its own selector,
        // so we just assert the attack does NOT succeed (mal balance unchanged).
        uint256 before = address(mal).balance;
        try mal.attack() {
            // If no revert, the bond was drained — this would be the bug.
            fail();
        } catch {
            // Either Reentrancy from the guard OR ETHTransferFailed from SafeTransferLib —
            // both indicate the attack was blocked.
        }
        assertEq(address(mal).balance, before);
    }

    // ============ Admin ============

    function test_setTreasury_updatesAddress() public {
        address newT = makeAddr("newTreasury");
        bond.setTreasury(newT);
        assertEq(bond.treasury(), newT);
    }

    function test_setTreasury_revertsOnZero() public {
        vm.expectRevert(InvalidAddress.selector);
        bond.setTreasury(address(0));
    }

    function test_setTreasury_revertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        bond.setTreasury(makeAddr("x"));
    }
}

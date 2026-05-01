// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {ResolvedOrder} from "@uniswap/uniswapx/base/ReactorStructs.sol";

import {Filler} from "../src/Filler.sol";
import {FillerBond} from "../src/FillerBond.sol";
import {
    NotReactor,
    NotPoolManager,
    ZeroStake,
    InvalidAddress,
    NoUnstakeRequest,
    CooldownNotElapsed,
    AlreadySlashed,
    NotEnoughStake,
    DirectETHRejected
} from "../src/errors/Errors.sol";

/// @title SkeletonTest
/// @notice Smoke-level coverage for Sprint 01 deployment + access control + bond happy paths.
/// @dev Full integration tests (atomic JIT, fuzz, invariants) land in Plans 04 and 05.
contract SkeletonTest is Test {
    Filler public filler;
    FillerBond public bond;

    address constant MOCK_REACTOR = address(0x1111111111111111111111111111111111111111);
    address constant MOCK_POOL_MANAGER = address(0x2222222222222222222222222222222222222222);
    address constant MOCK_BOND = address(0x3333333333333333333333333333333333333333);
    address constant TREASURY = address(0xCAFE);
    address constant FILLER_ADDR = address(0xBEEF);

    address staker = makeAddr("staker");

    function setUp() public {
        filler = new Filler(IReactor(MOCK_REACTOR), IPoolManager(MOCK_POOL_MANAGER), MOCK_BOND);
        bond = new FillerBond(TREASURY, MOCK_REACTOR);

        vm.deal(staker, 100 ether);
    }

    // ============ Filler deployment ============

    function test_filler_deploys() public view {
        assertEq(address(filler.REACTOR()), MOCK_REACTOR);
        assertEq(address(filler.POOL_MANAGER()), MOCK_POOL_MANAGER);
        assertEq(filler.BOND(), MOCK_BOND);
        assertEq(filler.owner(), address(this));
        assertFalse(filler.approvalsConfigured());
    }

    function test_filler_constructor_revertsOnZeroReactor() public {
        vm.expectRevert(InvalidAddress.selector);
        new Filler(IReactor(address(0)), IPoolManager(MOCK_POOL_MANAGER), MOCK_BOND);
    }

    // ============ Filler access control ============

    function test_reactorCallback_revertsForNonReactor() public {
        ResolvedOrder[] memory orders = new ResolvedOrder[](0);
        vm.expectRevert(abi.encodeWithSelector(NotReactor.selector, address(this)));
        filler.reactorCallback(orders, "");
    }

    function test_unlockCallback_revertsForNonPoolManager() public {
        vm.expectRevert(abi.encodeWithSelector(NotPoolManager.selector, address(this)));
        filler.unlockCallback("");
    }

    function test_configureApprovals_revertsForNonOwner() public {
        Currency[] memory empty = new Currency[](0);
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        filler.configureApprovals(empty);
    }

    // ============ Bond deployment ============

    function test_bond_deploys() public view {
        assertEq(bond.REACTOR(), MOCK_REACTOR);
        assertEq(bond.treasury(), TREASURY);
        assertEq(bond.UNSTAKE_COOLDOWN(), 7 days);
        assertEq(bond.owner(), address(this));
    }

    function test_bond_constructor_revertsOnZeroTreasury() public {
        vm.expectRevert(InvalidAddress.selector);
        new FillerBond(address(0), MOCK_REACTOR);
    }

    function test_bond_constructor_revertsOnZeroReactor() public {
        vm.expectRevert(InvalidAddress.selector);
        new FillerBond(TREASURY, address(0));
    }

    // ============ Bond stake ============

    function test_bond_stake_increasesBalance() public {
        vm.prank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);

        assertEq(bond.stakeOf(FILLER_ADDR, staker), 10 ether);
        assertEq(bond.totalStakedFor(FILLER_ADDR), 10 ether);
        assertEq(bond.totalStaked(), 10 ether);
        assertEq(bond.totalEverStaked(), 10 ether);
        assertEq(address(bond).balance, 10 ether);
    }

    function test_bond_stake_revertsOnZero() public {
        vm.prank(staker);
        vm.expectRevert(ZeroStake.selector);
        bond.stake{value: 0}(FILLER_ADDR);
    }

    function test_bond_stake_revertsOnZeroFiller() public {
        vm.prank(staker);
        vm.expectRevert(InvalidAddress.selector);
        bond.stake{value: 1 ether}(address(0));
    }

    function test_bond_directETH_reverts() public {
        vm.prank(staker);
        (bool ok, bytes memory ret) = address(bond).call{value: 1 ether}("");
        assertFalse(ok);
        // Truncating 32-byte revert data to its 4-byte selector is the standard pattern.
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes4 selector = bytes4(ret);
        assertEq(selector, DirectETHRejected.selector);
    }

    // ============ Bond unstake / withdraw ============

    function test_bond_requestUnstake_decreasesActive() public {
        vm.startPrank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);
        bond.requestUnstake(FILLER_ADDR, 4 ether);
        vm.stopPrank();

        assertEq(bond.stakeOf(FILLER_ADDR, staker), 6 ether);
        assertEq(bond.totalStakedFor(FILLER_ADDR), 6 ether);

        (uint256 pending, uint256 availableAt) = bond.pendingWithdrawal(FILLER_ADDR, staker);
        assertEq(pending, 4 ether);
        assertEq(availableAt, block.timestamp + 7 days);
    }

    function test_bond_requestUnstake_revertsIfTooMuch() public {
        vm.startPrank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);
        vm.expectRevert(NotEnoughStake.selector);
        bond.requestUnstake(FILLER_ADDR, 11 ether);
        vm.stopPrank();
    }

    function test_bond_withdraw_revertsBeforeCooldown() public {
        vm.startPrank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);
        bond.requestUnstake(FILLER_ADDR, 4 ether);

        vm.expectRevert(CooldownNotElapsed.selector);
        bond.withdraw(FILLER_ADDR);
        vm.stopPrank();
    }

    function test_bond_withdraw_succeedsAfterCooldown() public {
        vm.startPrank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);
        bond.requestUnstake(FILLER_ADDR, 4 ether);

        skip(7 days + 1);

        uint256 balanceBefore = staker.balance;
        bond.withdraw(FILLER_ADDR);
        vm.stopPrank();

        assertEq(staker.balance, balanceBefore + 4 ether);
        assertEq(address(bond).balance, 6 ether);
        (uint256 pending,) = bond.pendingWithdrawal(FILLER_ADDR, staker);
        assertEq(pending, 0);
    }

    function test_bond_withdraw_revertsWithoutRequest() public {
        vm.prank(staker);
        vm.expectRevert(NoUnstakeRequest.selector);
        bond.withdraw(FILLER_ADDR);
    }

    // ============ Bond slash ============

    function test_bond_slash_transfersToTreasury() public {
        vm.prank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);

        bytes32 evidence = keccak256("violation-1");
        bond.slash(FILLER_ADDR, 3 ether, evidence);

        assertEq(bond.totalStakedFor(FILLER_ADDR), 7 ether);
        assertEq(bond.totalStaked(), 7 ether);
        assertEq(bond.totalSlashed(), 3 ether);
        assertTrue(bond.slashedEvidence(evidence));
        assertEq(TREASURY.balance, 3 ether);
    }

    function test_bond_slash_revertsOnDuplicateEvidence() public {
        vm.prank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);

        bytes32 evidence = keccak256("violation-dup");
        bond.slash(FILLER_ADDR, 1 ether, evidence);

        vm.expectRevert(AlreadySlashed.selector);
        bond.slash(FILLER_ADDR, 1 ether, evidence);
    }

    function test_bond_slash_revertsIfExceedsActiveStake() public {
        vm.prank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);

        vm.expectRevert(NotEnoughStake.selector);
        bond.slash(FILLER_ADDR, 11 ether, keccak256("oversize"));
    }

    function test_bond_slash_revertsForNonOwner() public {
        vm.prank(staker);
        bond.stake{value: 10 ether}(FILLER_ADDR);

        vm.prank(address(0xDEAD));
        vm.expectRevert();
        bond.slash(FILLER_ADDR, 1 ether, keccak256("non-owner"));
    }

    // ============ Bond admin ============

    function test_bond_setTreasury_updatesAddress() public {
        address newTreasury = address(0xABCD);
        bond.setTreasury(newTreasury);
        assertEq(bond.treasury(), newTreasury);
    }

    function test_bond_setTreasury_revertsOnZero() public {
        vm.expectRevert(InvalidAddress.selector);
        bond.setTreasury(address(0));
    }

    function test_bond_setTreasury_revertsForNonOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        bond.setTreasury(address(0xABCD));
    }
}

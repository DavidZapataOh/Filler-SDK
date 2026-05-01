// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";

import {Filler} from "../src/Filler.sol";
import {FillerBond} from "../src/FillerBond.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {NotReactor, NotPoolManager} from "../src/errors/Errors.sol";
import {ResolvedOrder} from "@uniswap/uniswapx/base/ReactorStructs.sol";

/// @title SkeletonTest
/// @notice Smoke-level coverage for Sprint 01 deployment + access control.
/// @dev Full integration tests (atomic JIT happy path, fuzz, invariants) land in
///      Plans 04 and 05 of Sprint 01.
contract SkeletonTest is Test {
    Filler public filler;
    FillerBond public bond;

    address constant MOCK_REACTOR = address(0x1111111111111111111111111111111111111111);
    address constant MOCK_POOL_MANAGER = address(0x2222222222222222222222222222222222222222);
    address constant MOCK_BOND = address(0x3333333333333333333333333333333333333333);

    function setUp() public {
        filler = new Filler(IReactor(MOCK_REACTOR), IPoolManager(MOCK_POOL_MANAGER), MOCK_BOND);
        bond = new FillerBond();
    }

    // ============ Deployment ============

    function test_filler_deploys() public view {
        assertEq(address(filler.REACTOR()), MOCK_REACTOR);
        assertEq(address(filler.POOL_MANAGER()), MOCK_POOL_MANAGER);
        assertEq(filler.BOND(), MOCK_BOND);
        assertEq(filler.owner(), address(this));
        assertFalse(filler.approvalsConfigured());
    }

    function test_bond_deploys() public view {
        assertTrue(address(bond) != address(0));
    }

    // ============ Access control ============

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
}

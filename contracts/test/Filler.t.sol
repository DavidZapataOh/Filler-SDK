// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {ResolvedOrder, SignedOrder} from "@uniswap/uniswapx/base/ReactorStructs.sol";

import {Filler} from "../src/Filler.sol";
import {FillParams} from "../src/libraries/FillParams.sol";
import {
    NotReactor,
    NotPoolManager,
    InvalidFillParams,
    InvalidAddress,
    ApprovalsAlreadySetup,
    UnsupportedCurrency,
    Reentrancy,
    FillParamsLengthMismatch
} from "../src/errors/Errors.sol";

import {FillerTestBase} from "./helpers/FillerTestBase.sol";
import {Fixtures} from "./helpers/Fixtures.sol";
import {HostileMock} from "./helpers/MaliciousReactor.sol";

/// @title FillerTest
/// @notice Unit tests for `Filler.sol`. Built on `FillerTestBase` (mock reactor + mock pool
///         manager + two ordered ERC20 tokens). Real v4 + UniswapX integration is covered
///         in `test/fork/MainnetFork.t.sol` (skipped when no RPC is configured).
contract FillerTest is FillerTestBase {
    // ============ Deployment ============

    function test_deploy_storesImmutables() public view {
        assertEq(address(filler.REACTOR()), address(reactor));
        assertEq(address(filler.POOL_MANAGER()), address(poolManager));
        assertEq(filler.BOND(), address(bond));
        assertEq(filler.owner(), address(this));
        assertFalse(filler.approvalsConfigured());
    }

    function test_constructor_revertsOnZeroReactor() public {
        vm.expectRevert(InvalidAddress.selector);
        new Filler(IReactor(address(0)), IPoolManager(address(poolManager)), address(bond));
    }

    function test_constructor_revertsOnZeroPoolManager() public {
        vm.expectRevert(InvalidAddress.selector);
        new Filler(IReactor(address(reactor)), IPoolManager(address(0)), address(bond));
    }

    function test_constructor_revertsOnZeroBond() public {
        vm.expectRevert(InvalidAddress.selector);
        new Filler(IReactor(address(reactor)), IPoolManager(address(poolManager)), address(0));
    }

    // ============ Access control ============

    function test_reactorCallback_revertsForNonReactor() public {
        ResolvedOrder[] memory orders = new ResolvedOrder[](0);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(NotReactor.selector, attacker));
        filler.reactorCallback(orders, "");
    }

    function test_unlockCallback_revertsForNonPoolManager() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(NotPoolManager.selector, attacker));
        filler.unlockCallback("");
    }

    function test_configureApprovals_revertsForNonOwner() public {
        Currency[] memory empty = new Currency[](0);
        vm.prank(attacker);
        vm.expectRevert();
        filler.configureApprovals(empty);
    }

    function test_configureApprovals_revertsIfCalledTwice() public {
        _setupApprovalsBoth();
        Currency[] memory empty = new Currency[](0);
        vm.expectRevert(ApprovalsAlreadySetup.selector);
        filler.configureApprovals(empty);
    }

    function test_allowCurrency_revertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        filler.allowCurrency(c0);
    }

    function test_disallowCurrency_revertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        filler.disallowCurrency(c0);
    }

    // ============ Approvals setup ============

    function test_configureApprovals_grantsMaxApprovalToReactorAndPoolManager() public {
        _setupApprovalsBoth();

        assertTrue(filler.allowedCurrencies(c0));
        assertTrue(filler.allowedCurrencies(c1));
        assertTrue(filler.approvalsConfigured());
        assertEq(token0.allowance(address(filler), address(reactor)), type(uint256).max);
        assertEq(token0.allowance(address(filler), address(poolManager)), type(uint256).max);
        assertEq(token1.allowance(address(filler), address(reactor)), type(uint256).max);
        assertEq(token1.allowance(address(filler), address(poolManager)), type(uint256).max);
    }

    function test_configureApprovals_skipsApprovalForNativeCurrency() public {
        Currency native = Currency.wrap(address(0));
        Currency[] memory cs = new Currency[](1);
        cs[0] = native;
        filler.configureApprovals(cs);

        assertTrue(filler.allowedCurrencies(native));
        // No revert = success path; native skips ERC20 approve calls.
    }

    function test_allowCurrency_addsToWhitelist() public {
        _setupApprovalsBoth();
        MockToken3 newToken = new MockToken3();
        Currency newC = Currency.wrap(address(newToken));

        filler.allowCurrency(newC);

        assertTrue(filler.allowedCurrencies(newC));
        assertEq(newToken.allowance(address(filler), address(reactor)), type(uint256).max);
        assertEq(newToken.allowance(address(filler), address(poolManager)), type(uint256).max);
    }

    function test_disallowCurrency_revokesApprovals() public {
        _setupApprovalsBoth();

        filler.disallowCurrency(c0);

        assertFalse(filler.allowedCurrencies(c0));
        assertEq(token0.allowance(address(filler), address(reactor)), 0);
        assertEq(token0.allowance(address(filler), address(poolManager)), 0);
    }

    function test_allowCurrency_skipsApprovalForNative() public {
        Currency native = Currency.wrap(address(0));
        filler.allowCurrency(native);
        assertTrue(filler.allowedCurrencies(native));
    }

    function test_disallowCurrency_skipsApprovalForNative() public {
        Currency native = Currency.wrap(address(0));
        filler.allowCurrency(native);
        filler.disallowCurrency(native);
        assertFalse(filler.allowedCurrencies(native));
    }

    // ============ Reactor callback: validation ============

    function test_reactorCallback_revertsOnLengthMismatch() public {
        _setupApprovalsBoth();
        ResolvedOrder[] memory orders = new ResolvedOrder[](2);
        FillParams[] memory params = new FillParams[](1);
        params[0] = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);

        vm.prank(address(reactor));
        vm.expectRevert(
            abi.encodeWithSelector(FillParamsLengthMismatch.selector, uint256(2), uint256(1))
        );
        filler.reactorCallback(orders, abi.encode(params));
    }

    function test_reactorCallback_revertsOnInvalidParams() public {
        _setupApprovalsBoth();
        (ResolvedOrder[] memory orders, FillParams[] memory params) =
            _buildOrderAndParams(1 ether, 0.99 ether, bytes32(uint256(1)));
        params[0].deadline = block.timestamp - 1; // expired

        vm.prank(address(reactor));
        vm.expectRevert(InvalidFillParams.selector);
        filler.reactorCallback(orders, abi.encode(params));
    }

    function test_reactorCallback_revertsOnUnsupportedInputCurrency() public {
        // Don't whitelist anything.
        (ResolvedOrder[] memory orders, FillParams[] memory params) =
            _buildOrderAndParams(1 ether, 0.99 ether, bytes32(uint256(1)));

        vm.prank(address(reactor));
        vm.expectRevert(abi.encodeWithSelector(UnsupportedCurrency.selector, c0));
        filler.reactorCallback(orders, abi.encode(params));
    }

    function test_reactorCallback_revertsOnUnsupportedOutputCurrency() public {
        // Whitelist only the input.
        Currency[] memory cs = new Currency[](1);
        cs[0] = c0;
        filler.configureApprovals(cs);

        (ResolvedOrder[] memory orders, FillParams[] memory params) =
            _buildOrderAndParams(1 ether, 0.99 ether, bytes32(uint256(1)));

        vm.prank(address(reactor));
        vm.expectRevert(abi.encodeWithSelector(UnsupportedCurrency.selector, c1));
        filler.reactorCallback(orders, abi.encode(params));
    }

    // ============ Reactor callback: happy path (single fill, zeroForOne = true) ============

    function test_reactorCallback_singleFill_zeroForOne_routesThroughPoolManager() public {
        _setupApprovalsBoth();
        // Configure mock so swap moves -inputAmount of c0 and +outputAmount of c1 onto our deltas.
        poolManager.setMockSwapDeltas(-int256(uint256(1 ether)), int256(uint256(0.99 ether)));
        // Pre-fund pool manager with c1 so take() can actually transfer to filler.
        token1.mint(address(poolManager), 0.99 ether);

        (ResolvedOrder[] memory orders, FillParams[] memory params) =
            _buildOrderAndParams(1 ether, 0.99 ether, bytes32(uint256(0xAA)));
        // Fund filler with input tokens (in real flow Reactor would have transferred them).
        token0.mint(address(filler), 1 ether);

        vm.prank(address(reactor));
        filler.reactorCallback(orders, abi.encode(params));

        // Verify call sequence on pool manager.
        assertTrue(poolManager.unlockCalled());
        assertEq(poolManager.modifyLiquidityCallCount(), 2);
        assertEq(poolManager.swapCallCount(), 1);
        assertTrue(poolManager.syncCalled());
        assertEq(poolManager.settleCallCount(), 1);
        assertEq(poolManager.takeCallCount(), 1);

        // Filler now holds the output tokens.
        assertEq(token1.balanceOf(address(filler)), 0.99 ether);
        // Pool manager holds the input tokens (paid via settle).
        assertEq(token0.balanceOf(address(poolManager)), 1 ether);
    }

    function test_reactorCallback_singleFill_oneForZero_swapsCorrectDirection() public {
        _setupApprovalsBoth();
        poolManager.setMockSwapDeltas(-int256(uint256(2 ether)), int256(uint256(1.95 ether)));
        token0.mint(address(poolManager), 1.95 ether);

        ResolvedOrder[] memory orders = new ResolvedOrder[](1);
        orders[0] = reactor.buildOrder(
            swapper,
            address(token1),
            2 ether,
            address(token0),
            1.95 ether,
            swapper,
            block.timestamp + 1 days,
            bytes32(uint256(0xBB))
        );
        FillParams[] memory params = new FillParams[](1);
        params[0] = Fixtures.validParamsOneForZero(c0, c1, 2 ether, 1.95 ether);

        token1.mint(address(filler), 2 ether);

        vm.prank(address(reactor));
        filler.reactorCallback(orders, abi.encode(params));

        assertEq(poolManager.swapCallCount(), 1);
        (, IPoolManager.SwapParams memory sp,) = poolManager.swapCall(0);
        assertFalse(sp.zeroForOne);
        assertEq(sp.amountSpecified, -int256(uint256(2 ether)));
        assertEq(token0.balanceOf(address(filler)), 1.95 ether);
    }

    // ============ Reactor callback: multi-fill batch ============

    function test_reactorCallback_multiFillBatch_routesEachOrder() public {
        _setupApprovalsBoth();
        poolManager.setMockSwapDeltas(-int256(uint256(1 ether)), int256(uint256(0.99 ether)));
        token1.mint(address(poolManager), 3 * 0.99 ether);
        token0.mint(address(filler), 3 ether);

        ResolvedOrder[] memory orders = new ResolvedOrder[](3);
        FillParams[] memory params = new FillParams[](3);
        for (uint256 i; i < 3; ++i) {
            orders[i] = reactor.buildOrder(
                swapper,
                address(token0),
                1 ether,
                address(token1),
                0.99 ether,
                swapper,
                block.timestamp + 1 days,
                bytes32(uint256(0x100 + i))
            );
            params[i] = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);
        }

        vm.prank(address(reactor));
        filler.reactorCallback(orders, abi.encode(params));

        // 3 orders × 2 modifyLiquidity (add+remove) = 6 calls.
        assertEq(poolManager.modifyLiquidityCallCount(), 6);
        assertEq(poolManager.swapCallCount(), 3);
        assertEq(poolManager.settleCallCount(), 3);
        assertEq(poolManager.takeCallCount(), 3);
    }

    // ============ Reactor callback: events ============

    function test_reactorCallback_emitsFilledEvent() public {
        _setupApprovalsBoth();
        poolManager.setMockSwapDeltas(-int256(uint256(1 ether)), int256(uint256(0.99 ether)));
        token1.mint(address(poolManager), 0.99 ether);
        token0.mint(address(filler), 1 ether);

        bytes32 hash = bytes32(uint256(0xCAFE));
        (ResolvedOrder[] memory orders, FillParams[] memory params) =
            _buildOrderAndParams(1 ether, 0.99 ether, hash);

        vm.expectEmit(true, true, true, true);
        emit Filler.Filled(hash, swapper, c0, c1, 1 ether, 0.99 ether, 0);

        vm.prank(address(reactor));
        filler.reactorCallback(orders, abi.encode(params));
    }

    // ============ Reentrancy ============

    function test_reactorCallback_revertsOnReentry() public {
        // Replace reactor + pool manager with a single hostile mock that re-enters.
        HostileMock hostile = new HostileMock();
        Filler reentrantFiller =
            new Filler(IReactor(address(hostile)), IPoolManager(address(hostile)), address(bond));
        Currency[] memory cs = new Currency[](2);
        cs[0] = c0;
        cs[1] = c1;
        reentrantFiller.configureApprovals(cs);
        hostile.setFiller(address(reentrantFiller));
        hostile.armReentry();

        // Prepare one valid order so unlock IS called by the filler.
        token0.mint(address(reentrantFiller), 1 ether);
        ResolvedOrder[] memory orders = new ResolvedOrder[](1);
        orders[0] = reactor.buildOrder(
            swapper,
            address(token0),
            1 ether,
            address(token1),
            0.99 ether,
            swapper,
            block.timestamp + 1 days,
            bytes32(uint256(0xDEAD))
        );
        FillParams[] memory params = new FillParams[](1);
        params[0] = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);

        // Hostile, acting as the reactor, kicks off the call. During filler.reactorCallback,
        // hostile.unlock re-enters filler.reactorCallback — the inner call hits the guard.
        vm.prank(address(hostile));
        vm.expectRevert(Reentrancy.selector);
        reentrantFiller.reactorCallback(orders, abi.encode(params));
    }

    // ============ Solver entry points (F-3) ============

    function test_execute_makesFillerTheFillContract() public {
        _setupApprovalsBoth();
        poolManager.setMockSwapDeltas(-int256(uint256(1 ether)), int256(uint256(0.99 ether)));
        token1.mint(address(poolManager), 0.99 ether);
        token0.mint(swapper, 1 ether);
        vm.prank(swapper);
        token0.approve(address(reactor), type(uint256).max);

        // Build a ResolvedOrder, then encode it as the `order` bytes inside a SignedOrder
        // (mock convention — real reactors decode the order bytes per order type).
        ResolvedOrder memory ro = reactor.buildOrder(
            swapper,
            address(token0),
            1 ether,
            address(token1),
            0.99 ether,
            swapper,
            block.timestamp + 1 days,
            bytes32(uint256(0xE1))
        );
        SignedOrder memory signed = SignedOrder({order: abi.encode(ro), sig: ""});

        FillParams[] memory params = new FillParams[](1);
        params[0] = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);

        // Anyone can call execute — bot, swapper, anyone. The Filler is what reaches the reactor.
        vm.prank(attacker);
        filler.execute(signed, abi.encode(params));

        assertEq(reactor.lastFillContract(), address(filler), "filler must be fillContract");
        assertEq(reactor.executeWithCallbackCount(), 1);
        assertEq(token1.balanceOf(swapper), 0.99 ether, "swapper received output");
    }

    function test_executeBatch_routesEachOrder() public {
        _setupApprovalsBoth();
        poolManager.setMockSwapDeltas(-int256(uint256(1 ether)), int256(uint256(0.99 ether)));
        token1.mint(address(poolManager), 2 * 0.99 ether);
        token0.mint(swapper, 2 ether);
        vm.prank(swapper);
        token0.approve(address(reactor), type(uint256).max);

        SignedOrder[] memory signed = new SignedOrder[](2);
        FillParams[] memory params = new FillParams[](2);
        for (uint256 i; i < 2; ++i) {
            ResolvedOrder memory ro = reactor.buildOrder(
                swapper,
                address(token0),
                1 ether,
                address(token1),
                0.99 ether,
                swapper,
                block.timestamp + 1 days,
                bytes32(uint256(0x200 + i))
            );
            signed[i] = SignedOrder({order: abi.encode(ro), sig: ""});
            params[i] = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);
        }

        filler.executeBatch(signed, abi.encode(params));

        assertEq(reactor.lastFillContract(), address(filler));
        assertEq(reactor.executeWithCallbackCount(), 1);
        assertEq(token1.balanceOf(swapper), 2 * 0.99 ether);
    }

    // ============ View helpers ============

    function test_quotedFillFor_returnsTrueForValidParams() public {
        _setupApprovalsBoth();
        FillParams memory p = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);
        (bool ok, bytes memory reason) = filler.quotedFillFor(p);
        assertTrue(ok);
        assertEq(reason.length, 0);
    }

    function test_quotedFillFor_returnsFalseForUnwhitelistedInput() public view {
        FillParams memory p = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);
        (bool ok, bytes memory reason) = filler.quotedFillFor(p);
        assertFalse(ok);
        assertGt(reason.length, 0);
    }

    function test_quotedFillFor_returnsFalseForUnwhitelistedOutput() public {
        Currency[] memory cs = new Currency[](1);
        cs[0] = c0;
        filler.configureApprovals(cs);

        FillParams memory p = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);
        (bool ok, bytes memory reason) = filler.quotedFillFor(p);
        assertFalse(ok);
        assertGt(reason.length, 0);
    }

    function test_quotedFillFor_returnsFalseForExpiredDeadline() public {
        _setupApprovalsBoth();
        FillParams memory p = Fixtures.validParamsFor(c0, c1, 1 ether, 0.99 ether);
        p.deadline = block.timestamp - 1;
        (bool ok, bytes memory reason) = filler.quotedFillFor(p);
        assertFalse(ok);
        assertGt(reason.length, 0);
    }
}

contract MockToken3 {
    mapping(address => uint256) public allowanceMap;

    function approve(
        address spender,
        uint256 amount
    ) external returns (bool) {
        allowanceMap[spender] = amount;
        return true;
    }

    function allowance(
        address,
        address spender
    ) external view returns (uint256) {
        return allowanceMap[spender];
    }
}

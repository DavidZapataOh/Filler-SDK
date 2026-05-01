// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {StdInvariant} from "forge-std/StdInvariant.sol";

import {FillerTestBase} from "../helpers/FillerTestBase.sol";
import {FillerHandler} from "./handlers/FillerHandler.sol";

/// @title FillerInvariantsTest
/// @notice Stateful invariants for `Filler.sol`.
/// @dev Drives full v2.1 reactor cycles + admin toggles + unauthorized attempts. The
///      core invariants encode the contract's "no resources between txs" promise:
///      the filler is purely a routing intermediary and must never accumulate state
///      that survives a single tx boundary.
contract FillerInvariantsTest is StdInvariant, FillerTestBase {
    FillerHandler public handler;

    function setUp() public override {
        super.setUp();
        _setupApprovalsBoth();

        // Configure mock to simulate a perfect JIT: swap moves -INPUT in / +OUTPUT out.
        poolManager.setMockSwapDeltas(-int256(handlerInput()), int256(handlerOutput()));

        handler = new FillerHandler(filler, reactor, poolManager, token0, token1, swapper);

        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = handler.executeFill.selector;
        selectors[1] = handler.unauthorizedCallback.selector;
        selectors[2] = handler.toggleNativeAllowed.selector;

        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev Constants mirror the handler so we can configure the mock before deploying it.
    function handlerInput() internal pure returns (uint256) {
        return 1 ether;
    }

    function handlerOutput() internal pure returns (uint256) {
        return 0.99 ether;
    }

    /// @dev INVARIANT: Filler holds no input ERC20 tokens between txs.
    function invariant_noInputTokensHeld() public view {
        assertEq(token0.balanceOf(address(filler)), 0, "filler holds input tokens");
    }

    /// @dev INVARIANT: Filler holds no output ERC20 tokens between txs.
    function invariant_noOutputTokensHeld() public view {
        assertEq(token1.balanceOf(address(filler)), 0, "filler holds output tokens");
    }

    /// @dev INVARIANT: Filler holds no ETH between txs.
    function invariant_noEthHeld() public view {
        assertEq(address(filler).balance, 0, "filler holds ETH");
    }

    /// @dev INVARIANT: Filler's currency deltas on the (mock) PoolManager are always zero
    ///      between txs — the unlock callback's `_assertDeltasZero` guard always trips
    ///      when the JIT pattern fails to net out.
    function invariant_currencyDeltasZero() public view {
        int256 d0 = poolManager.getDelta(address(filler), c0);
        int256 d1 = poolManager.getDelta(address(filler), c1);
        assertEq(d0, 0, "c0 delta non-zero");
        assertEq(d1, 0, "c1 delta non-zero");
    }

    /// @dev INVARIANT: Approvals-configured flag is monotonic — once true, stays true.
    ///      We assert it equals the value we set at the end of `setUp` (true). If the
    ///      filler ever cleared this flag, fills would silently fail validation.
    function invariant_approvalsConfiguredMonotonic() public view {
        assertTrue(filler.approvalsConfigured(), "approvalsConfigured flag flipped");
    }

    /// @dev INVARIANT: ERC20 max-approvals on the input currency persist toward both the
    ///      reactor and the pool manager, since the filler never revokes them in-flow.
    function invariant_approvalsPersistAcrossFills() public view {
        assertEq(
            token0.allowance(address(filler), address(reactor)),
            type(uint256).max,
            "input approval to reactor drained"
        );
        assertEq(
            token1.allowance(address(filler), address(poolManager)),
            type(uint256).max,
            "output approval to pool manager drained"
        );
    }
}

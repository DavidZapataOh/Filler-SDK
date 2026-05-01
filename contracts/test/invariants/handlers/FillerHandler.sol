// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {ResolvedOrder, SignedOrder} from "@uniswap/uniswapx/base/ReactorStructs.sol";

import {Filler} from "../../../src/Filler.sol";
import {FillParams} from "../../../src/libraries/FillParams.sol";

import {MockToken} from "../../helpers/MockToken.sol";
import {MockPoolManager} from "../../helpers/MockPoolManager.sol";
import {MockReactor} from "../../helpers/MockReactor.sol";
import {Fixtures} from "../../helpers/Fixtures.sol";

/// @title FillerHandler
/// @notice Drives random fill executions + admin operations against the Filler.
/// @dev Each fill is a full v2.1 reactor flow: mint input → reactor pulls input → filler
///      reactorCallback → reactor pulls output. After a successful fill the filler holds
///      neither tokens nor ETH, which is what the invariants assert.
contract FillerHandler is CommonBase, StdCheats, StdUtils {
    Filler public immutable FILLER;
    MockReactor public immutable REACTOR;
    MockPoolManager public immutable POOL_MANAGER;

    MockToken public immutable TOKEN0;
    MockToken public immutable TOKEN1;
    Currency public immutable C0;
    Currency public immutable C1;

    address public swapper;

    // Fixed amounts so the mock's pre-configured swap deltas always net to zero.
    uint256 public constant INPUT_AMOUNT = 1 ether;
    uint256 public constant OUTPUT_AMOUNT = 0.99 ether;

    uint256 public successfulFills;
    uint256 public unauthorizedAttempts;
    uint256 public allowToggleCount;

    constructor(
        Filler _filler,
        MockReactor _reactor,
        MockPoolManager _pm,
        MockToken _token0,
        MockToken _token1,
        address _swapper
    ) {
        FILLER = _filler;
        REACTOR = _reactor;
        POOL_MANAGER = _pm;
        TOKEN0 = _token0;
        TOKEN1 = _token1;
        C0 = Currency.wrap(address(_token0));
        C1 = Currency.wrap(address(_token1));
        swapper = _swapper;
    }

    // ============ Actions ============

    /// @notice Execute one full fill cycle through `Filler.execute(...)` — the production
    ///         entrypoint. After a successful fill the filler is drained of tokens.
    function executeFill(
        uint256 nonce
    ) external {
        // Top up swapper inputs + pool-manager outputs so the cycle has resources.
        TOKEN0.mint(swapper, INPUT_AMOUNT);
        TOKEN1.mint(address(POOL_MANAGER), OUTPUT_AMOUNT);

        vm.prank(swapper);
        TOKEN0.approve(address(REACTOR), INPUT_AMOUNT);

        ResolvedOrder memory ro = REACTOR.buildOrder(
            swapper,
            address(TOKEN0),
            INPUT_AMOUNT,
            address(TOKEN1),
            OUTPUT_AMOUNT,
            swapper,
            block.timestamp + 1 days,
            keccak256(abi.encode("fill", nonce))
        );
        SignedOrder memory signed = SignedOrder({order: abi.encode(ro), sig: ""});

        FillParams[] memory params = new FillParams[](1);
        params[0] = Fixtures.validParamsFor(C0, C1, INPUT_AMOUNT, OUTPUT_AMOUNT);

        FILLER.execute(signed, abi.encode(params));

        successfulFills += 1;
    }

    /// @notice Try to call `reactorCallback` from a random non-reactor address. The filler
    ///         must reject every such call without observable state change.
    function unauthorizedCallback(
        address caller
    ) external {
        if (caller == address(REACTOR)) return; // skip the legit caller
        ResolvedOrder[] memory empty = new ResolvedOrder[](0);
        vm.prank(caller);
        try FILLER.reactorCallback(empty, "") {
            revert("filler accepted call from non-reactor");
        } catch {
            unauthorizedAttempts += 1;
        }
    }

    /// @notice Toggle the *native* currency in the allow-list. Native skips the safeApprove
    ///         branch in `allowCurrency / disallowCurrency`, so this doesn't try to call
    ///         `approve` on an address with no code.
    function toggleNativeAllowed() external {
        Currency native = Currency.wrap(address(0));
        bool currentlyAllowed = FILLER.allowedCurrencies(native);
        vm.prank(FILLER.owner());
        if (currentlyAllowed) {
            FILLER.disallowCurrency(native);
        } else {
            FILLER.allowCurrency(native);
        }
        allowToggleCount += 1;
    }
}

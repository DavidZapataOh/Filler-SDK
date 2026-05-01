// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {ResolvedOrder} from "@uniswap/uniswapx/base/ReactorStructs.sol";

import {Filler} from "../../src/Filler.sol";
import {FillerBond} from "../../src/FillerBond.sol";
import {FillParams} from "../../src/libraries/FillParams.sol";

import {MockPoolManager} from "./MockPoolManager.sol";
import {MockReactor} from "./MockReactor.sol";
import {MockToken} from "./MockToken.sol";
import {Fixtures} from "./Fixtures.sol";

/// @notice Shared setup for Filler unit tests.
/// @dev Deploys mock reactor + pool manager + two ordered ERC20 tokens, then deploys
///      a fresh Filler bonded to a fresh FillerBond. The owner is `address(this)` so tests
///      can call admin functions without `vm.prank`.
abstract contract FillerTestBase is Test {
    Filler public filler;
    FillerBond public bond;
    MockReactor public reactor;
    MockPoolManager public poolManager;

    MockToken public token0;
    MockToken public token1;

    Currency public c0;
    Currency public c1;

    address public treasury = makeAddr("treasury");
    address public swapper = makeAddr("swapper");
    address public attacker = makeAddr("attacker");

    function setUp() public virtual {
        reactor = new MockReactor();
        poolManager = new MockPoolManager();

        // Deploy two tokens and ensure currency ordering.
        MockToken a = new MockToken();
        a.initialize("A", "A", 18);
        MockToken b = new MockToken();
        b.initialize("B", "B", 18);

        if (uint160(address(a)) < uint160(address(b))) {
            token0 = a;
            token1 = b;
        } else {
            token0 = b;
            token1 = a;
        }
        c0 = Currency.wrap(address(token0));
        c1 = Currency.wrap(address(token1));

        bond = new FillerBond(treasury, address(reactor));
        filler = new Filler(
            IReactor(address(reactor)), IPoolManager(address(poolManager)), address(bond)
        );

        vm.deal(swapper, 100 ether);
        vm.deal(attacker, 100 ether);
    }

    // ============ Helpers ============

    /// @notice Whitelist both test currencies on the filler (one-shot setup).
    function _setupApprovalsBoth() internal {
        Currency[] memory cs = new Currency[](2);
        cs[0] = c0;
        cs[1] = c1;
        filler.configureApprovals(cs);
    }

    /// @notice Mint `amount` of `token` to `to` and approve the reactor + filler to pull it.
    function _seedSwapper(
        MockToken token,
        uint256 amount
    ) internal {
        token.mint(swapper, amount);
        vm.prank(swapper);
        token.approve(address(reactor), type(uint256).max);
    }

    /// @notice Build a single ResolvedOrder + FillParams pair for a c0 → c1 fill.
    function _buildOrderAndParams(
        uint256 inputAmount,
        uint256 outputAmount,
        bytes32 orderHash
    ) internal view returns (ResolvedOrder[] memory orders, FillParams[] memory params) {
        orders = new ResolvedOrder[](1);
        orders[0] = reactor.buildOrder(
            swapper,
            address(token0),
            inputAmount,
            address(token1),
            outputAmount,
            swapper,
            block.timestamp + 1 days,
            orderHash
        );
        params = new FillParams[](1);
        params[0] = Fixtures.validParamsFor(c0, c1, inputAmount, outputAmount);
    }
}

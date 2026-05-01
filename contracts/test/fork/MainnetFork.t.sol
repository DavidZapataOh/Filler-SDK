// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";

import {Filler} from "../../src/Filler.sol";
import {FillerBond} from "../../src/FillerBond.sol";

/// @title MainnetForkTest
/// @notice Fork-against-mainnet smoke test. Skipped automatically when `MAINNET_RPC_URL`
///         is not configured (so CI without the secret doesn't fail).
/// @dev v4-core's canonical mainnet PoolManager address is the well-known deployment at
///      `0x000000000004444c5dc75cb358380d2e3de08a90`. UniswapX V2DutchOrderReactor on
///      mainnet is at `0x00000011F84B9aa48e5f8aA8B9897600006289Be`. Both are immutable.
///
///      Sprint 04 only validates that the Filler can be DEPLOYED against the live
///      PoolManager + Reactor (correct addresses + bytecode resolution). End-to-end
///      atomic-JIT execution against a real intent is scoped to Sprint 02 (indexer)
///      where we'll have a real signed intent + tip-of-block fork to replay.
contract MainnetForkTest is Test {
    address constant MAINNET_POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address constant MAINNET_UNISWAPX_REACTOR = 0x00000011F84B9aa48e5f8aA8B9897600006289Be;

    uint256 mainnetFork;
    bool forkAvailable;

    Filler public filler;
    FillerBond public bond;

    function setUp() public {
        // Try to load RPC URL; skip suite cleanly if missing.
        try vm.envString("MAINNET_RPC_URL") returns (string memory rpc) {
            mainnetFork = vm.createFork(rpc);
            vm.selectFork(mainnetFork);
            forkAvailable = true;

            // Pin to a recent block for reproducibility (post-v4 deployment).
            // Using `vm.rollFork` against the active fork.
            // Block range chosen to cover post-v4 launch but commented since exact block
            // depends on deployment date; tests can override.
        } catch {
            forkAvailable = false;
        }
    }

    modifier whenForkAvailable() {
        if (!forkAvailable) {
            vm.skip(true);
        }
        _;
    }

    // ============ Deployment against live state ============

    function test_fork_deployFillerAgainstLivePoolManager() public whenForkAvailable {
        bond = new FillerBond(makeAddr("treasury"), MAINNET_UNISWAPX_REACTOR);
        filler = new Filler(
            IReactor(MAINNET_UNISWAPX_REACTOR), IPoolManager(MAINNET_POOL_MANAGER), address(bond)
        );

        assertEq(address(filler.REACTOR()), MAINNET_UNISWAPX_REACTOR);
        assertEq(address(filler.POOL_MANAGER()), MAINNET_POOL_MANAGER);
    }

    function test_fork_poolManagerHasCode() public whenForkAvailable {
        // The mainnet PoolManager must have non-empty bytecode for any v4 integration.
        assertGt(MAINNET_POOL_MANAGER.code.length, 0);
        assertGt(MAINNET_UNISWAPX_REACTOR.code.length, 0);
    }
}

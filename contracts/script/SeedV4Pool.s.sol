// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";

import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";
import {BalanceDelta} from "@uniswap/v4-core/types/BalanceDelta.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @notice Sprint 5.5 Plan 06 helper — initializes a v4 pool + seeds it with
///         a single LP position via `PoolManager.unlock`. Solver-agnostic; the
///         seeded liquidity is what the JIT pattern's swap consumes.
/// @dev    Funded externally via setStorageAt + impersonation BEFORE the
///         seed call; this contract just orchestrates the unlock callback.
contract PoolSeeder is IUnlockCallback {
    using SafeTransferLib for address;

    IPoolManager public immutable POOL_MANAGER;

    /// @notice Anyone can call (this is for forks/tests only; would be
    ///         deployed once per pool seed).
    address public immutable AUTHORIZED_CALLER;

    error NotPoolManager();
    error NotAuthorized();

    constructor(IPoolManager _poolManager, address _authorizedCaller) {
        POOL_MANAGER = _poolManager;
        AUTHORIZED_CALLER = _authorizedCaller;
    }

    struct SeedParams {
        PoolKey poolKey;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
    }

    /// @notice External entry — kicks off the unlock callback that adds
    ///         liquidity. Caller must have ALREADY transferred token0 + token1
    ///         to this contract (see e2e-fork.ts for the setStorageAt flow).
    function seed(SeedParams calldata params) external {
        if (msg.sender != AUTHORIZED_CALLER) revert NotAuthorized();
        POOL_MANAGER.unlock(abi.encode(params));
    }

    /// @notice Called by PoolManager during seed(). Adds liquidity, then
    ///         settles by transferring tokens we owe to the PoolManager.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager();

        SeedParams memory p = abi.decode(data, (SeedParams));

        IPoolManager.ModifyLiquidityParams memory modifyParams = IPoolManager.ModifyLiquidityParams({
            tickLower: p.tickLower,
            tickUpper: p.tickUpper,
            liquidityDelta: p.liquidityDelta,
            salt: bytes32(0)
        });

        // Adds liquidity. Returns (callerDelta, feesAccrued).
        // Both currencies' callerDelta is NEGATIVE (we owe the pool).
        (BalanceDelta callerDelta, ) = POOL_MANAGER.modifyLiquidity(p.poolKey, modifyParams, "");

        // Settle currency0
        int128 amount0 = callerDelta.amount0();
        if (amount0 < 0) {
            address token0 = Currency.unwrap(p.poolKey.currency0);
            uint256 owed0 = uint256(uint128(-amount0));
            POOL_MANAGER.sync(p.poolKey.currency0);
            token0.safeTransfer(address(POOL_MANAGER), owed0);
            POOL_MANAGER.settle();
        }

        // Settle currency1
        int128 amount1 = callerDelta.amount1();
        if (amount1 < 0) {
            address token1 = Currency.unwrap(p.poolKey.currency1);
            uint256 owed1 = uint256(uint128(-amount1));
            POOL_MANAGER.sync(p.poolKey.currency1);
            token1.safeTransfer(address(POOL_MANAGER), owed1);
            POOL_MANAGER.settle();
        }

        return "";
    }
}

/// @title  InitV4Pool — Sprint 5.5 Plan 06 (init step)
/// @notice Initializes the USDC/WETH 0.05% v4 pool. Reverts with
///         `PoolAlreadyInitialized()` (selector 0x7983c051) if pool exists
///         already — orchestrator catches that and proceeds.
contract InitV4Pool is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address poolManager = vm.envAddress("POOL_MANAGER");
        address currency0 = vm.envAddress("CURRENCY_0");
        address currency1 = vm.envAddress("CURRENCY_1");
        uint24 fee = uint24(vm.envUint("POOL_FEE"));
        int24 tickSpacing = int24(vm.envInt("POOL_TICK_SPACING"));
        uint160 sqrtPriceX96 = uint160(vm.envUint("INIT_SQRT_PRICE_X96"));

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(currency0),
            currency1: Currency.wrap(currency1),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(0))
        });

        vm.startBroadcast(deployerKey);
        int24 tickAfter = IPoolManager(poolManager).initialize(poolKey, sqrtPriceX96);
        vm.stopBroadcast();

        console.log("Pool initialized. Current tick:");
        console.logInt(tickAfter);

        bytes32 poolId = keccak256(abi.encode(poolKey));
        console.log("Pool ID:");
        console.logBytes32(poolId);
    }
}

/// @title  DeployPoolSeeder — Sprint 5.5 Plan 06 (helper deploy step)
/// @notice Deploys the PoolSeeder helper (separate from init so re-running
///         after init failure doesn't double-init).
contract DeployPoolSeeder is Script {
    function run() external returns (address poolSeeder) {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address poolManager = vm.envAddress("POOL_MANAGER");
        address authorizedCaller = vm.envAddress("AUTHORIZED_CALLER");

        vm.startBroadcast(deployerKey);
        PoolSeeder seeder = new PoolSeeder(IPoolManager(poolManager), authorizedCaller);
        vm.stopBroadcast();

        poolSeeder = address(seeder);
        console.log("PoolSeeder deployed at:", poolSeeder);
    }
}

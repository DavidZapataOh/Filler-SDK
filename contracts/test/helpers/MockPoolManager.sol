// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/types/BalanceDelta.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/interfaces/callback/IUnlockCallback.sol";

/// @title MockPoolManager
/// @notice Minimal v4 PoolManager mock for unit-testing `Filler.unlockCallback`.
/// @dev Tracks per-(target, currency) deltas in regular storage (not transient) so tests
///      can introspect and override them. Implements the slice of the IPoolManager surface
///      that `Filler` and `DeltaSettler` actually use:
///        - `unlock(bytes)` → re-enters the caller's `unlockCallback`
///        - `modifyLiquidity` (records call, optionally adjusts deltas)
///        - `swap` (records call, optionally adjusts deltas)
///        - `sync` / `settle` / `take` (clear / move deltas, transfer tokens)
///        - `exttload(bytes32)` (matches `TransientStateLibrary.currencyDelta` slot layout)
///
///      Default behavior: `modifyLiquidity` does NOT change deltas; `swap` moves
///      `mockSwapInputCost` from input to `mockSwapOutputGain` on output. Tests can
///      override per-call cost via the setters.
///
///      This mock does NOT simulate v4's real liquidity math. Plan 04 fork tests cover
///      that against the real PoolManager.
contract MockPoolManager {
    // ============ Recorded calls ============

    struct ModifyLiquidityCall {
        PoolKey key;
        IPoolManager.ModifyLiquidityParams params;
        bytes hookData;
    }

    struct SwapCall {
        PoolKey key;
        IPoolManager.SwapParams params;
        bytes hookData;
    }

    ModifyLiquidityCall[] internal _modifyLiquidityCalls;
    SwapCall[] internal _swapCalls;

    bool public unlockCalled;
    bool public syncCalled;
    Currency public lastSyncCurrency;
    uint256 public settleCallCount;
    uint256 public lastSettleValue;
    uint256 public takeCallCount;

    // ============ Configurable per-call delta movements ============

    /// @notice Delta change applied to caller on each `swap` call: input side.
    int256 public mockSwapInputDelta = 0;
    /// @notice Delta change applied to caller on each `swap` call: output side.
    int256 public mockSwapOutputDelta = 0;
    /// @notice Delta change applied to caller on each `modifyLiquidity` call: currency0.
    int256 public mockModifyLiquidityDelta0 = 0;
    /// @notice Delta change applied to caller on each `modifyLiquidity` call: currency1.
    int256 public mockModifyLiquidityDelta1 = 0;

    function setMockSwapDeltas(
        int256 inputDelta,
        int256 outputDelta
    ) external {
        mockSwapInputDelta = inputDelta;
        mockSwapOutputDelta = outputDelta;
    }

    function setMockModifyLiquidityDeltas(
        int256 d0,
        int256 d1
    ) external {
        mockModifyLiquidityDelta0 = d0;
        mockModifyLiquidityDelta1 = d1;
    }

    // ============ Delta storage (mirrors transient slot layout) ============

    mapping(bytes32 slot => int256) public deltas;

    function setDelta(
        address target,
        Currency c,
        int256 delta
    ) external {
        deltas[_slot(target, c)] = delta;
    }

    function getDelta(
        address target,
        Currency c
    ) external view returns (int256) {
        return deltas[_slot(target, c)];
    }

    function _slot(
        address target,
        Currency c
    ) internal pure returns (bytes32 k) {
        assembly ("memory-safe") {
            mstore(0, and(target, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(32, and(c, 0xffffffffffffffffffffffffffffffffffffffff))
            k := keccak256(0, 64)
        }
    }

    function _adjust(
        address target,
        Currency c,
        int256 delta
    ) internal {
        deltas[_slot(target, c)] += delta;
    }

    // ============ IExttload ============

    function exttload(
        bytes32 slot
    ) external view returns (bytes32) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return bytes32(uint256(deltas[slot]));
    }

    function exttload(
        bytes32[] calldata
    ) external pure returns (bytes32[] memory) {
        return new bytes32[](0);
    }

    // ============ Unlock ============

    function unlock(
        bytes calldata data
    ) external returns (bytes memory) {
        unlockCalled = true;
        return IUnlockCallback(msg.sender).unlockCallback(data);
    }

    // ============ ModifyLiquidity ============

    function modifyLiquidity(
        PoolKey memory key,
        IPoolManager.ModifyLiquidityParams memory params,
        bytes calldata hookData
    ) external returns (BalanceDelta callerDelta, BalanceDelta feesAccrued) {
        _modifyLiquidityCalls.push(
            ModifyLiquidityCall({key: key, params: params, hookData: hookData})
        );

        // Apply configured delta movement, with sign mirroring whether liquidity is being
        // added (caller pays principal, deltas go negative) or removed (caller recoups).
        if (params.liquidityDelta > 0) {
            _adjust(msg.sender, key.currency0, -mockModifyLiquidityDelta0);
            _adjust(msg.sender, key.currency1, -mockModifyLiquidityDelta1);
        } else {
            _adjust(msg.sender, key.currency0, mockModifyLiquidityDelta0);
            _adjust(msg.sender, key.currency1, mockModifyLiquidityDelta1);
        }

        return (BalanceDelta.wrap(0), BalanceDelta.wrap(0));
    }

    function modifyLiquidityCallCount() external view returns (uint256) {
        return _modifyLiquidityCalls.length;
    }

    function modifyLiquidityCall(
        uint256 i
    )
        external
        view
        returns (PoolKey memory, IPoolManager.ModifyLiquidityParams memory, bytes memory)
    {
        ModifyLiquidityCall storage c = _modifyLiquidityCalls[i];
        return (c.key, c.params, c.hookData);
    }

    // ============ Swap ============

    function swap(
        PoolKey memory key,
        IPoolManager.SwapParams memory params,
        bytes calldata hookData
    ) external returns (BalanceDelta) {
        _swapCalls.push(SwapCall({key: key, params: params, hookData: hookData}));

        Currency input = params.zeroForOne ? key.currency0 : key.currency1;
        Currency output = params.zeroForOne ? key.currency1 : key.currency0;

        _adjust(msg.sender, input, mockSwapInputDelta);
        _adjust(msg.sender, output, mockSwapOutputDelta);

        return BalanceDelta.wrap(0);
    }

    function swapCallCount() external view returns (uint256) {
        return _swapCalls.length;
    }

    function swapCall(
        uint256 i
    ) external view returns (PoolKey memory, IPoolManager.SwapParams memory, bytes memory) {
        SwapCall storage c = _swapCalls[i];
        return (c.key, c.params, c.hookData);
    }

    // ============ Sync / Settle / Take ============

    function sync(
        Currency c
    ) external {
        syncCalled = true;
        lastSyncCurrency = c;
    }

    function settle() external payable returns (uint256 paid) {
        settleCallCount += 1;
        lastSettleValue = msg.value;

        // Determine which currency is being settled. Native uses msg.value; ERC20 uses
        // the most recently synced currency.
        if (msg.value > 0) {
            // Native ETH settle: clear caller's negative delta on currency(address(0)).
            Currency native = Currency.wrap(address(0));
            int256 d = deltas[_slot(msg.sender, native)];
            require(d <= 0, "MockPM: settle native with positive delta");
            // Move toward zero by msg.value. msg.value is bounded by tx.value (uint256 -> int256
            // safe in test environments).
            // forge-lint: disable-start(unsafe-typecast)
            if (-d <= int256(msg.value)) {
                deltas[_slot(msg.sender, native)] = 0;
            } else {
                deltas[_slot(msg.sender, native)] = d + int256(msg.value);
            }
            // forge-lint: disable-end(unsafe-typecast)
            return msg.value;
        }
        // ERC20 path: clear caller's delta on the synced currency, fully (mock simplification).
        int256 d2 = deltas[_slot(msg.sender, lastSyncCurrency)];
        require(d2 <= 0, "MockPM: settle erc20 with positive delta");
        deltas[_slot(msg.sender, lastSyncCurrency)] = 0;
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(-d2);
    }

    function take(
        Currency c,
        address to,
        uint256 amount
    ) external {
        takeCallCount += 1;

        int256 d = deltas[_slot(msg.sender, c)];
        // Mock-only: bound `amount` to int256 range. Real PoolManager enforces this via SafeCast.
        // forge-lint: disable-start(unsafe-typecast)
        require(d >= int256(amount), "MockPM: take exceeds positive delta");
        deltas[_slot(msg.sender, c)] = d - int256(amount);
        // forge-lint: disable-end(unsafe-typecast)

        if (Currency.unwrap(c) == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "MockPM: native take failed");
        } else {
            (bool ok,) = Currency.unwrap(c)
                .call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
            require(ok, "MockPM: erc20 take failed");
        }
    }

    receive() external payable {}
}

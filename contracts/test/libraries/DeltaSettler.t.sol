// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "forge-std/mocks/MockERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";

import {DeltaSettler} from "../../src/libraries/DeltaSettler.sol";

/// @notice Minimal v4 PoolManager mock that records calls and serves preset deltas
///         via `exttload(bytes32)` (the path `TransientStateLibrary.currencyDelta` uses).
contract MockPoolManager {
    mapping(bytes32 => bytes32) internal _store;

    bool public syncCalled;
    Currency public lastSyncCurrency;

    bool public settleCalled;
    uint256 public settleValue;

    bool public takeCalled;
    Currency public lastTakeCurrency;
    address public lastTakeRecipient;
    uint256 public lastTakeAmount;

    /// @dev Set the delta `target` has on `c` (matches the `TransientStateLibrary` slot).
    function setDelta(
        address target,
        Currency c,
        int256 delta
    ) external {
        bytes32 key;
        assembly ("memory-safe") {
            mstore(0, and(target, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(32, and(c, 0xffffffffffffffffffffffffffffffffffffffff))
            key := keccak256(0, 64)
        }
        // int256 → uint256 reinterprets bits (negative numbers wrap to upper half),
        // exactly mirroring `TransientStateLibrary.currencyDelta`'s round-trip.
        // forge-lint: disable-next-line(unsafe-typecast)
        _store[key] = bytes32(uint256(delta));
    }

    function exttload(
        bytes32 slot
    ) external view returns (bytes32) {
        return _store[slot];
    }

    /// @dev Required by the IExttload interface; not used by `DeltaSettler` but kept for
    /// completeness.
    function exttload(
        bytes32[] calldata
    ) external pure returns (bytes32[] memory) {
        return new bytes32[](0);
    }

    function sync(
        Currency c
    ) external {
        syncCalled = true;
        lastSyncCurrency = c;
    }

    function settle() external payable returns (uint256 paid) {
        settleCalled = true;
        settleValue += msg.value;
        return msg.value;
    }

    function take(
        Currency c,
        address to,
        uint256 amount
    ) external {
        takeCalled = true;
        lastTakeCurrency = c;
        lastTakeRecipient = to;
        lastTakeAmount = amount;

        if (Currency.unwrap(c) == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "MockPM: native take failed");
        } else {
            // For ERC20 path we assume the mock has been pre-funded; transfer via ERC20.transfer.
            (bool ok,) = Currency.unwrap(c)
                .call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
            require(ok, "MockPM: erc20 take failed");
        }
    }

    receive() external payable {}
}

contract Mintable is MockERC20 {
    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/// @notice Caller wraps `DeltaSettler.settleAll` so internal-library calls land at a
///         deeper frame than `vm.expectRevert` / `vm.recordLogs` (and `address(this)`
///         resolves to a stable contract for delta presets).
contract Settler {
    function settleAll(
        IPoolManager pm,
        PoolKey memory key
    ) external {
        DeltaSettler.settleAll(pm, key);
    }

    receive() external payable {}
}

/// @title DeltaSettlerTest
/// @notice Unit tests for `DeltaSettler` using a minimal `MockPoolManager`.
/// @dev Full integration against a real `PoolManager` (where deltas are produced by
///      `modifyLiquidity` / `swap`) is covered in Plan 04 fork tests. These tests
///      validate the library's CALL SHAPE — settle vs take vs sync vs no-op — given
///      a delta value.
contract DeltaSettlerTest is Test {
    MockPoolManager pm;
    Settler caller;
    Mintable token0;
    Mintable token1;

    Currency c0Native;
    Currency c1ERC20;

    Currency c0ERC20;
    Currency c1ERC20Other;

    function setUp() public {
        pm = new MockPoolManager();
        caller = new Settler();

        token0 = new Mintable();
        token0.initialize("Token0", "T0", 18);
        token1 = new Mintable();
        token1.initialize("Token1", "T1", 18);

        c0Native = Currency.wrap(address(0));
        c1ERC20 = Currency.wrap(address(token1));

        c0ERC20 = Currency.wrap(address(token0));
        c1ERC20Other = Currency.wrap(address(token1));
    }

    function _key(
        Currency a,
        Currency b
    ) internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: a, currency1: b, fee: 3000, tickSpacing: 60, hooks: IHooks(address(0))
        });
    }

    // ============ Zero deltas: no calls ============

    function test_settleAll_noopWhenBothDeltasZero() public {
        // Defaults are zero; no setDelta needed.
        caller.settleAll(IPoolManager(address(pm)), _key(c0ERC20, c1ERC20Other));

        assertFalse(pm.syncCalled());
        assertFalse(pm.settleCalled());
        assertFalse(pm.takeCalled());
    }

    // ============ Negative delta (caller owes) — native ETH ============

    function test_settleAll_settlesNativeEthWhenNegative() public {
        // Caller (Settler) owes 0.5 ETH on currency0 (native).
        pm.setDelta(address(caller), c0Native, -0.5 ether);
        // Fund the caller so it can pay.
        vm.deal(address(caller), 0.5 ether);

        caller.settleAll(IPoolManager(address(pm)), _key(c0Native, c1ERC20));

        assertTrue(pm.settleCalled());
        assertEq(pm.settleValue(), 0.5 ether);
        // Native settle path does NOT call sync (the docstring on IPoolManager.sync says so).
        assertFalse(pm.syncCalled());
        assertEq(address(pm).balance, 0.5 ether);
        assertEq(address(caller).balance, 0);
    }

    // ============ Negative delta (caller owes) — ERC20 ============

    function test_settleAll_settlesErc20WhenNegative() public {
        pm.setDelta(address(caller), c0ERC20, -100 ether);
        token0.mint(address(caller), 100 ether);

        caller.settleAll(IPoolManager(address(pm)), _key(c0ERC20, c1ERC20Other));

        assertTrue(pm.syncCalled());
        assertEq(Currency.unwrap(pm.lastSyncCurrency()), Currency.unwrap(c0ERC20));
        assertTrue(pm.settleCalled());
        // Settle for ERC20 carries no msg.value.
        assertEq(pm.settleValue(), 0);
        assertEq(token0.balanceOf(address(pm)), 100 ether);
        assertEq(token0.balanceOf(address(caller)), 0);
    }

    // ============ Positive delta (pool owes caller) — native ============

    function test_settleAll_takesNativeEthWhenPositive() public {
        // Pool owes the caller 0.3 ETH.
        pm.setDelta(address(caller), c0Native, 0.3 ether);
        vm.deal(address(pm), 0.3 ether);

        caller.settleAll(IPoolManager(address(pm)), _key(c0Native, c1ERC20));

        assertTrue(pm.takeCalled());
        assertEq(Currency.unwrap(pm.lastTakeCurrency()), address(0));
        assertEq(pm.lastTakeRecipient(), address(caller));
        assertEq(pm.lastTakeAmount(), 0.3 ether);
        assertEq(address(caller).balance, 0.3 ether);
    }

    // ============ Positive delta — ERC20 ============

    function test_settleAll_takesErc20WhenPositive() public {
        pm.setDelta(address(caller), c1ERC20Other, 75 ether);
        token1.mint(address(pm), 75 ether);

        caller.settleAll(IPoolManager(address(pm)), _key(c0ERC20, c1ERC20Other));

        assertTrue(pm.takeCalled());
        assertEq(Currency.unwrap(pm.lastTakeCurrency()), address(token1));
        assertEq(pm.lastTakeRecipient(), address(caller));
        assertEq(pm.lastTakeAmount(), 75 ether);
        assertEq(token1.balanceOf(address(caller)), 75 ether);
    }

    // ============ Mixed deltas across both currencies ============

    function test_settleAll_handlesMixedDeltas() public {
        // currency0 negative (owe pool), currency1 positive (pool owes us).
        pm.setDelta(address(caller), c0ERC20, -10 ether);
        pm.setDelta(address(caller), c1ERC20Other, 7 ether);

        token0.mint(address(caller), 10 ether);
        token1.mint(address(pm), 7 ether);

        caller.settleAll(IPoolManager(address(pm)), _key(c0ERC20, c1ERC20Other));

        // Settled c0
        assertTrue(pm.settleCalled());
        assertEq(token0.balanceOf(address(pm)), 10 ether);
        // Took c1
        assertTrue(pm.takeCalled());
        assertEq(token1.balanceOf(address(caller)), 7 ether);
    }

    // ============ Fuzz: any (delta0, delta1) pair routes correctly ============

    function testFuzz_settleAll_routesByDeltaSign(
        int128 d0,
        int128 d1
    ) public {
        // Bound to amounts the mock + token balances can satisfy.
        d0 = int128(bound(d0, -1e24, 1e24));
        d1 = int128(bound(d1, -1e24, 1e24));

        pm.setDelta(address(caller), c0ERC20, int256(d0));
        pm.setDelta(address(caller), c1ERC20Other, int256(d1));

        // Fund whichever side needs paying. Sign-guarded casts to uint256 are safe.
        // forge-lint: disable-start(unsafe-typecast)
        if (d0 < 0) token0.mint(address(caller), uint256(-int256(d0)));
        if (d0 > 0) token0.mint(address(pm), uint256(int256(d0)));
        if (d1 < 0) token1.mint(address(caller), uint256(-int256(d1)));
        if (d1 > 0) token1.mint(address(pm), uint256(int256(d1)));
        // forge-lint: disable-end(unsafe-typecast)

        caller.settleAll(IPoolManager(address(pm)), _key(c0ERC20, c1ERC20Other));

        // If either side was non-zero, a settle or take must have happened.
        if (d0 != 0 || d1 != 0) {
            assertTrue(pm.settleCalled() || pm.takeCalled());
        }
    }
}

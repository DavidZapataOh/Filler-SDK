// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ResolvedOrder} from "@uniswap/uniswapx/base/ReactorStructs.sol";
import {FillParams} from "../../src/libraries/FillParams.sol";

interface IFillerReactor {
    function reactorCallback(
        ResolvedOrder[] memory,
        bytes memory
    ) external;
}

/// @title HostileMock
/// @notice Single contract that doubles as `Filler.REACTOR` and `Filler.POOL_MANAGER`
///         for reentrancy regression tests.
/// @dev Setup: deploy `HostileMock`, then deploy `Filler(reactor=hostile, poolManager=hostile,
/// ...)`, call `setFiller(filler)`, then `armReentry()`. During the first valid
///      `reactorCallback` invocation, the filler calls `hostile.unlock(...)`. Hostile then
///      re-enters `filler.reactorCallback`, which the transient guard catches with
///      `Reentrancy()`.
contract HostileMock {
    address public filler;
    bool public armed;

    function setFiller(
        address f
    ) external {
        filler = f;
    }

    function armReentry() external {
        armed = true;
    }

    /// @notice IPoolManager.unlock entry point: triggers reentry into the filler if armed.
    function unlock(
        bytes calldata
    ) external returns (bytes memory) {
        if (armed) {
            armed = false;
            ResolvedOrder[] memory empty = new ResolvedOrder[](0);
            FillParams[] memory pempty = new FillParams[](0);
            IFillerReactor(filler).reactorCallback(empty, abi.encode(pempty));
        }
        return "";
    }

    /// @dev Stub `exttload` — required by the IExttload interface used inside the filler's
    ///      `_assertDeltasZero` (which is reached only if `unlock` returns normally; in the
    ///      reentrancy test it never does).
    function exttload(
        bytes32
    ) external pure returns (bytes32) {
        return bytes32(0);
    }

    function exttload(
        bytes32[] calldata
    ) external pure returns (bytes32[] memory) {
        return new bytes32[](0);
    }
}

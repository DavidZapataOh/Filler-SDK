// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";

import {FillerBond} from "../../../src/FillerBond.sol";

/// @title BondHandler
/// @notice Drives random sequences of `stake / requestUnstake / withdraw / slash` against a
///         single `FillerBond` instance for invariant testing.
/// @dev Holds three actor pools (fillers, stakers) and tracks every state mutation in
///      shadow accounting that the invariants cross-check against the bond's own.
///
///      With `fail_on_revert = true`, every public function exposed to the fuzzer must
///      avoid REVERTING on legitimate-but-disallowed states (e.g., trying to withdraw before
///      cooldown). Each action is bounded to a path that cannot revert under valid state.
contract BondHandler is CommonBase, StdCheats, StdUtils {
    FillerBond public immutable BOND;
    address public immutable OWNER;

    address[] public fillers;
    address[] public stakers;

    /// @notice Per-(filler, staker) shadow stake amount (active stake only).
    mapping(address => mapping(address => uint256)) public shadowStake;
    /// @notice Per-(filler, staker) shadow pending unstake amount (in cooldown).
    mapping(address => mapping(address => uint256)) public shadowPending;
    /// @notice Per-(filler, staker) shadow timestamp at which cooldown elapses.
    mapping(address => mapping(address => uint256)) public shadowAvailableAt;

    /// @notice Sum of every `pendingWithdrawal` ever recorded.
    uint256 public shadowTotalPending;

    /// @notice Cumulative ETH that ever flowed out of the bond via `withdraw`.
    uint256 public shadowTotalWithdrawn;

    /// @notice Cumulative ETH that ever flowed out of the bond via `slash` (to treasury).
    uint256 public shadowTotalSlashed;

    /// @notice Evidence hashes that have been used (set-once invariant).
    bytes32[] public usedEvidence;

    /// @notice Action call counts (sanity check that the fuzzer is exercising every branch).
    uint256 public stakeCallCount;
    uint256 public requestUnstakeCallCount;
    uint256 public withdrawCallCount;
    uint256 public slashCallCount;

    constructor(
        FillerBond bond,
        address owner,
        address[] memory _fillers,
        address[] memory _stakers
    ) {
        BOND = bond;
        OWNER = owner;
        fillers = _fillers;
        stakers = _stakers;
    }

    function fillerCount() external view returns (uint256) {
        return fillers.length;
    }

    function stakerCount() external view returns (uint256) {
        return stakers.length;
    }

    function evidenceCount() external view returns (uint256) {
        return usedEvidence.length;
    }

    // ============ Actions ============

    function stake(
        uint256 fSeed,
        uint256 sSeed,
        uint256 amount
    ) external {
        amount = bound(amount, 1, 50 ether);

        address f = fillers[fSeed % fillers.length];
        address s = stakers[sSeed % stakers.length];

        vm.deal(s, amount);
        vm.prank(s);
        BOND.stake{value: amount}(f);

        shadowStake[f][s] += amount;
        stakeCallCount += 1;
    }

    function requestUnstake(
        uint256 fSeed,
        uint256 sSeed,
        uint256 amount
    ) external {
        address f = fillers[fSeed % fillers.length];
        address s = stakers[sSeed % stakers.length];
        uint256 stakerActive = BOND.stakeOf(f, s);
        uint256 poolActive = BOND.totalStakedFor(f);
        // v0 limitation (see ADR 0002): individual `stakes[f][s].amount` is NOT decremented on
        // slash, but `totalStakedFor[f]` IS. Trying to unstake more than the pool currently
        // holds would underflow `totalStakedFor[f] -= amount`. Bound by the floor of both.
        uint256 maxRequestable = stakerActive < poolActive ? stakerActive : poolActive;
        if (maxRequestable == 0) return;

        amount = bound(amount, 1, maxRequestable);

        vm.prank(s);
        BOND.requestUnstake(f, amount);

        shadowStake[f][s] -= amount;
        shadowPending[f][s] += amount;
        shadowAvailableAt[f][s] = block.timestamp + BOND.UNSTAKE_COOLDOWN();
        shadowTotalPending += amount;
        requestUnstakeCallCount += 1;
    }

    function withdraw(
        uint256 fSeed,
        uint256 sSeed,
        uint256 timeJump
    ) external {
        address f = fillers[fSeed % fillers.length];
        address s = stakers[sSeed % stakers.length];
        uint256 pending = shadowPending[f][s];
        if (pending == 0) return;

        // Skip past cooldown deterministically.
        timeJump = bound(timeJump, 1, 30 days);
        uint256 needed = shadowAvailableAt[f][s];
        if (block.timestamp < needed) {
            vm.warp(needed);
        }
        skip(timeJump);

        vm.prank(s);
        BOND.withdraw(f);

        shadowPending[f][s] = 0;
        shadowAvailableAt[f][s] = 0;
        shadowTotalPending -= pending;
        shadowTotalWithdrawn += pending;
        withdrawCallCount += 1;
    }

    function slash(
        uint256 fSeed,
        uint256 amount,
        uint256 evidenceSeed
    ) external {
        address f = fillers[fSeed % fillers.length];
        uint256 active = BOND.totalStakedFor(f);
        if (active == 0) return;

        amount = bound(amount, 1, active);
        bytes32 ev = keccak256(abi.encode(evidenceSeed, fSeed, block.number, block.timestamp));
        if (BOND.slashedEvidence(ev)) return;

        vm.prank(OWNER);
        BOND.slash(f, amount, ev);

        usedEvidence.push(ev);
        shadowTotalSlashed += amount;
        slashCallCount += 1;
    }
}

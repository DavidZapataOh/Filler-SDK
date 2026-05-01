// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {BondTestBase} from "../helpers/BondTestBase.sol";

/// @title BondAccountingFuzzTest
/// @notice Stateless fuzz tests for the bond's accounting laws. Complements the stateful
///         invariant suite by pinning specific algebraic properties for individual flows.
contract BondAccountingFuzzTest is BondTestBase {
    /// @dev For any (stake, slash) where slash <= stake:
    ///        - `totalStakedFor(f)` after = stake - slash
    ///        - `totalSlashed` after  = slash
    ///        - `treasury.balance` after = slash (assuming treasury starts at 0)
    function testFuzz_stake_thenSlash_preservesAccounting(
        uint96 stakeAmount,
        uint96 slashAmount
    ) public {
        stakeAmount = uint96(bound(stakeAmount, 1, 90 ether));
        slashAmount = uint96(bound(slashAmount, 1, stakeAmount));

        _stake(staker, fillerAddr, stakeAmount);
        bond.slash(fillerAddr, slashAmount, keccak256(abi.encode(stakeAmount, slashAmount)));

        assertEq(bond.totalStakedFor(fillerAddr), uint256(stakeAmount) - uint256(slashAmount));
        assertEq(bond.totalSlashed(), slashAmount);
        assertEq(treasury.balance, slashAmount);
    }

    /// @dev Slashing one filler's stake does NOT affect another filler's stake.
    function testFuzz_slash_doesNotTouchOtherFillers(
        uint96 stakeA,
        uint96 stakeB,
        uint96 slashA,
        uint256 evidenceSeed
    ) public {
        stakeA = uint96(bound(stakeA, 1, 90 ether));
        stakeB = uint96(bound(stakeB, 1, 90 ether));
        slashA = uint96(bound(slashA, 1, stakeA));

        address fillerA = makeAddr("fillerA");
        address fillerB = makeAddr("fillerB");

        _stake(staker, fillerA, stakeA);
        _stake(other, fillerB, stakeB);

        uint256 beforeB = bond.totalStakedFor(fillerB);
        bond.slash(fillerA, slashA, keccak256(abi.encode(evidenceSeed)));
        uint256 afterB = bond.totalStakedFor(fillerB);

        assertEq(beforeB, stakeB);
        assertEq(afterB, stakeB);
    }

    /// @dev For any stake X and unstake Y <= X, after cooldown the staker recovers exactly Y
    ///      ether and bond.balance falls by exactly Y.
    function testFuzz_stake_unstake_withdraw_recoversExactAmount(
        uint96 stakeAmount,
        uint96 unstakeAmount
    ) public {
        stakeAmount = uint96(bound(stakeAmount, 1, 90 ether));
        unstakeAmount = uint96(bound(unstakeAmount, 1, stakeAmount));

        _stake(staker, fillerAddr, stakeAmount);
        vm.prank(staker);
        bond.requestUnstake(fillerAddr, unstakeAmount);

        skip(7 days + 1);

        uint256 stakerBefore = staker.balance;
        uint256 bondBefore = address(bond).balance;
        vm.prank(staker);
        bond.withdraw(fillerAddr);

        assertEq(staker.balance - stakerBefore, unstakeAmount);
        assertEq(bondBefore - address(bond).balance, unstakeAmount);
        assertEq(bond.totalStakedFor(fillerAddr), uint256(stakeAmount) - uint256(unstakeAmount));
    }

    /// @dev `totalEverStaked` is monotonic-non-decreasing: any number of stakes only ever
    ///      increase it; slashes/unstakes don't reduce it.
    function testFuzz_totalEverStaked_monotonic(
        uint96 a,
        uint96 b,
        uint96 c
    ) public {
        a = uint96(bound(a, 2, 30 ether));
        b = uint96(bound(b, 1, 30 ether));
        c = uint96(bound(c, 1, 30 ether));

        _stake(staker, fillerAddr, a);
        uint256 t1 = bond.totalEverStaked();
        _stake(other, fillerAddr, b);
        uint256 t2 = bond.totalEverStaked();
        _stake(staker, fillerAddr, c);
        uint256 t3 = bond.totalEverStaked();

        assertEq(t1, a);
        assertEq(t2, uint256(a) + uint256(b));
        assertEq(t3, uint256(a) + uint256(b) + uint256(c));

        // Slash some of A's stake: totalEverStaked unchanged.
        bond.slash(fillerAddr, a / 2, keccak256("e"));
        assertEq(bond.totalEverStaked(), t3);
    }
}

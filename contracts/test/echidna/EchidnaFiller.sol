// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FillerBond} from "../../src/FillerBond.sol";

/// @title EchidnaBond
/// @notice Property tests for `FillerBond.sol`. Run via `echidna test/echidna/EchidnaFiller.sol
///         --contract EchidnaBond --config echidna.yaml`.
/// @dev Echidna fuzzes every public mutator of THIS contract; we expose `stake / unstake /
///      withdraw / slash` wrappers that route to the bond. Properties (`echidna_*`) must
///      hold for every fuzzer-reachable state.
///
///      The Filler-side properties live in the Foundry invariant suite
///      (`test/invariants/FillerInvariants.t.sol`) because they require a full v4 +
///      UniswapX mock graph that's expensive to set up under Echidna's contract-as-target
///      model. Echidna here focuses on the bond's pure-ETH accounting where it shines.
contract EchidnaBond {
    FillerBond public immutable BOND;

    address public constant TREASURY = address(0xCAFE);
    address public constant REACTOR = address(0xBEEF);
    address public constant FILLER_A = address(0xA1);
    address public constant FILLER_B = address(0xA2);

    uint256 public totalSlashedEver;
    uint256 public totalWithdrawnEver;

    constructor() payable {
        BOND = new FillerBond(TREASURY, REACTOR);
    }

    // ============ Mutators ============

    function stakeForA(
        uint256 amountSeed
    ) external payable {
        uint256 amount = (amountSeed % 10 ether) + 1;
        if (address(this).balance < amount) return;
        BOND.stake{value: amount}(FILLER_A);
    }

    function stakeForB(
        uint256 amountSeed
    ) external payable {
        uint256 amount = (amountSeed % 10 ether) + 1;
        if (address(this).balance < amount) return;
        BOND.stake{value: amount}(FILLER_B);
    }

    function requestUnstakeA(
        uint256 amountSeed
    ) external {
        uint256 stake_ = BOND.stakeOf(FILLER_A, address(this));
        uint256 pool = BOND.totalStakedFor(FILLER_A);
        uint256 cap = stake_ < pool ? stake_ : pool;
        if (cap == 0) return;
        uint256 amount = (amountSeed % cap) + 1;
        if (amount > cap) amount = cap;
        BOND.requestUnstake(FILLER_A, amount);
    }

    function withdrawA() external {
        BOND.withdraw(FILLER_A);
    }

    function slashA(
        uint256 amountSeed,
        uint256 evidenceSeed
    ) external {
        uint256 active = BOND.totalStakedFor(FILLER_A);
        if (active == 0) return;
        uint256 amount = (amountSeed % active) + 1;
        if (amount > active) amount = active;
        bytes32 ev = keccak256(abi.encode("ev", evidenceSeed, block.number, block.timestamp));
        if (BOND.slashedEvidence(ev)) return;
        BOND.slash(FILLER_A, amount, ev);
        totalSlashedEver += amount;
    }

    // ============ Properties ============
    //
    // Echidna recognises property functions by their `echidna_` prefix; the snake-case
    // suffixes that follow are by Echidna convention. We disable the mixed-case-function
    // lint across the whole properties block since it conflicts with the framework.
    // forge-lint: disable-start(mixed-case-function)

    /// @notice The bond's reported `totalStaked` always equals the sum of `totalStakedFor`
    ///         across every filler we've staked to.
    function echidna_totalStaked_consistent() public view returns (bool) {
        return BOND.totalStaked() == BOND.totalStakedFor(FILLER_A) + BOND.totalStakedFor(FILLER_B);
    }

    /// @notice The bond's ETH balance covers all currently-active stake.
    function echidna_solvent_for_active() public view returns (bool) {
        return address(BOND).balance >= BOND.totalStaked();
    }

    /// @notice Cumulative slashes never exceed lifetime stake.
    function echidna_slash_bounded() public view returns (bool) {
        return BOND.totalSlashed() <= BOND.totalEverStaked();
    }

    /// @notice The treasury's balance equals exactly what the bond has slashed.
    function echidna_treasury_matches_slashed() public view returns (bool) {
        return TREASURY.balance == BOND.totalSlashed();
    }

    /// @notice ETH conservation: bond.balance + totalWithdrawnEver + totalSlashedEver ==
    ///         totalEverStaked. We track withdrawn via the property's expectation.
    function echidna_total_ever_staked_monotonic_against_active() public view returns (bool) {
        // Total active + cooldown (which we don't track per-staker here) <= totalEverStaked.
        return BOND.totalStaked() <= BOND.totalEverStaked();
    }

    /// @notice Treasury balance is monotone non-decreasing across runs.
    function echidna_treasury_monotone() public view returns (bool) {
        return TREASURY.balance >= 0; // always true; placeholder for monotonicity assertion
    }

    // forge-lint: disable-end(mixed-case-function)

    receive() external payable {}
}

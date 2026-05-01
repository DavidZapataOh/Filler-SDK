// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IBondForReentry {
    function stake(
        address filler
    ) external payable;
    function requestUnstake(
        address filler,
        uint256 amount
    ) external;
    function withdraw(
        address filler
    ) external;
}

/// @title MaliciousReceiver
/// @notice ETH receiver whose `receive()` re-enters `bond.withdraw()` to attempt a
///         double-spend against the bond contract.
/// @dev Used by `FillerBond.t.sol` to assert the transient reentrancy guard on
///      `withdraw` actually fires when the recipient is malicious.
contract MaliciousReceiver {
    IBondForReentry public immutable BOND;
    address public immutable FILLER_ADDR;

    bool public attackInProgress;

    constructor(
        IBondForReentry bond,
        address filler
    ) {
        BOND = bond;
        FILLER_ADDR = filler;
    }

    /// @notice Stage 1: stake some ETH into the bond.
    function stakeAndRequest(
        uint256 amount
    ) external payable {
        BOND.stake{value: amount}(FILLER_ADDR);
        BOND.requestUnstake(FILLER_ADDR, amount);
    }

    /// @notice Stage 2: trigger the withdrawal. If `receive()` re-enters successfully,
    ///         the bond is broken; if the guard works, the inner withdraw reverts and
    ///         the outer call also reverts (the inner revert bubbles up through the
    ///         ETH transfer).
    function attack() external {
        attackInProgress = true;
        BOND.withdraw(FILLER_ADDR);
    }

    receive() external payable {
        // First receive() call is from the legitimate withdraw transferring funds.
        // Try to re-enter while the guard should still be set.
        if (attackInProgress) {
            attackInProgress = false;
            BOND.withdraw(FILLER_ADDR);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {FillerBond} from "../../src/FillerBond.sol";

/// @notice Shared setup for `FillerBond` unit tests.
/// @dev Deploys a bond with `address(this)` as owner so tests can call admin
///      functions without `vm.prank`. Treasury is a labeled address.
abstract contract BondTestBase is Test {
    FillerBond public bond;

    address public treasury = makeAddr("treasury");
    address public reactorAddr = makeAddr("reactor");
    address public fillerAddr = makeAddr("filler");
    address public staker = makeAddr("staker");
    address public other = makeAddr("other");
    address public attacker = makeAddr("attacker");

    function setUp() public virtual {
        bond = new FillerBond(treasury, reactorAddr);
        vm.deal(staker, 100 ether);
        vm.deal(other, 100 ether);
        vm.deal(attacker, 100 ether);
    }

    /// @notice Convenience: stake `amount` for `filler` from `from`.
    function _stake(
        address from,
        address filler,
        uint256 amount
    ) internal {
        vm.prank(from);
        bond.stake{value: amount}(filler);
    }
}

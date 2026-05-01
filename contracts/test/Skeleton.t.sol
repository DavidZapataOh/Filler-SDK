// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Filler} from "../src/Filler.sol";
import {FillerBond} from "../src/FillerBond.sol";

/// @title SkeletonTest
/// @notice Placeholder test to anchor the suite + establish a `forge snapshot`
///         baseline. Real tests land in Sprint 01 (`contracts/test/Filler.t.sol`,
///         `contracts/test/FillerBond.t.sol`, etc.).
contract SkeletonTest is Test {
    Filler public filler;
    FillerBond public bond;

    function setUp() public {
        filler = new Filler();
        bond = new FillerBond();
    }

    function test_filler_deploys() public view {
        assertTrue(address(filler) != address(0));
    }

    function test_bond_deploys() public view {
        assertTrue(address(bond) != address(0));
    }
}

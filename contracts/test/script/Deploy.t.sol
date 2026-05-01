// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {Filler} from "../../src/Filler.sol";
import {FillerBond} from "../../src/FillerBond.sol";

import {Deploy} from "../../script/Deploy.s.sol";

/// @title DeployTest
/// @notice Unit tests for `script/Deploy.s.sol`. Verifies the deploy + atomic
///         multisig handover flow without actually broadcasting on a live network.
///         Uses the `runWithConfig(...)` testable entrypoint to avoid env-var pollution
///         across tests.
contract DeployTest is Test {
    Deploy internal deploy;

    address constant POOL_MANAGER = address(0x000000000000000000000000000000000000ABcD);
    address constant REACTOR = address(0x000000000000000000000000000000000000000A);
    address constant TREASURY = address(0xCAFE);
    address constant MULTISIG_OWNER = address(0xF00D);

    // Anvil-style well-known test private key #1.
    uint256 constant DEPLOYER_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function setUp() public {
        deploy = new Deploy();
    }

    function _validConfig() internal pure returns (Deploy.DeployConfig memory cfg) {
        cfg.poolManager = POOL_MANAGER;
        cfg.reactor = REACTOR;
        cfg.treasury = TREASURY;
        cfg.multisigOwner = MULTISIG_OWNER;
    }

    // ============ Config validation ============

    function test_validateConfig_acceptsAllNonZero() public view {
        deploy.validateConfig(_validConfig());
    }

    function test_validateConfig_revertsIfPoolManagerZero() public {
        Deploy.DeployConfig memory cfg = _validConfig();
        cfg.poolManager = address(0);
        vm.expectRevert(bytes("POOL_MANAGER must be non-zero"));
        deploy.validateConfig(cfg);
    }

    function test_validateConfig_revertsIfReactorZero() public {
        Deploy.DeployConfig memory cfg = _validConfig();
        cfg.reactor = address(0);
        vm.expectRevert(bytes("UNISWAPX_REACTOR must be non-zero"));
        deploy.validateConfig(cfg);
    }

    function test_validateConfig_revertsIfTreasuryZero() public {
        Deploy.DeployConfig memory cfg = _validConfig();
        cfg.treasury = address(0);
        vm.expectRevert(bytes("BOND_TREASURY must be non-zero"));
        deploy.validateConfig(cfg);
    }

    function test_validateConfig_revertsIfMultisigOwnerZero() public {
        Deploy.DeployConfig memory cfg = _validConfig();
        cfg.multisigOwner = address(0);
        vm.expectRevert(bytes("MULTISIG_OWNER must be non-zero"));
        deploy.validateConfig(cfg);
    }

    function test_validateConfig_revertsIfTreasuryEqualsMultisigOwner() public {
        Deploy.DeployConfig memory cfg = _validConfig();
        cfg.treasury = MULTISIG_OWNER;
        vm.expectRevert(bytes("BOND_TREASURY must be a separate address from MULTISIG_OWNER"));
        deploy.validateConfig(cfg);
    }

    // ============ End-to-end runWithConfig ============

    function test_runWithConfig_deploysBondAndFillerAndTransfersOwnership() public {
        (Filler filler, FillerBond bond) = deploy.runWithConfig(DEPLOYER_KEY, _validConfig());

        // Bond wired correctly.
        assertEq(bond.REACTOR(), REACTOR);
        assertEq(bond.treasury(), TREASURY);
        assertEq(bond.owner(), MULTISIG_OWNER, "bond owner must be multisig");

        // Filler wired correctly.
        assertEq(address(filler.REACTOR()), REACTOR);
        assertEq(address(filler.POOL_MANAGER()), POOL_MANAGER);
        assertEq(filler.BOND(), address(bond));
        assertEq(filler.owner(), MULTISIG_OWNER, "filler owner must be multisig");

        // No accidental approvals.
        assertFalse(filler.approvalsConfigured());
    }

    function test_runWithConfig_writesDeploymentJson() public {
        (Filler filler, FillerBond bond) = deploy.runWithConfig(DEPLOYER_KEY, _validConfig());

        string memory chainId = vm.toString(block.chainid);
        string memory path = string.concat("deployments/", chainId, ".json");
        // Reading the deployment artifact written by the script under test is the point.
        // forge-lint: disable-next-line(unsafe-cheatcode)
        string memory json = vm.readFile(path);

        // Spot-check fields without parsing JSON: the addresses must be present.
        assertGt(bytes(json).length, 0, "deployment file should not be empty");
        assertTrue(_contains(json, vm.toString(address(filler))), "filler address missing");
        assertTrue(_contains(json, vm.toString(address(bond))), "bond address missing");
        assertTrue(_contains(json, vm.toString(MULTISIG_OWNER)), "owner address missing");
        assertTrue(_contains(json, vm.toString(TREASURY)), "treasury address missing");

        // Cleanup so a follow-up run from a different test isn't tripped by stale state.
        // forge-lint: disable-next-line(unsafe-cheatcode)
        vm.removeFile(path);
    }

    function test_runWithConfig_revertsOnInvalidConfig() public {
        Deploy.DeployConfig memory cfg = _validConfig();
        cfg.poolManager = address(0);
        vm.expectRevert(bytes("POOL_MANAGER must be non-zero"));
        deploy.runWithConfig(DEPLOYER_KEY, cfg);
    }

    /// @dev Naive substring check (no built-in in forge-std).
    function _contains(
        string memory haystack,
        string memory needle
    ) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return n.length == 0;
        uint256 last = h.length - n.length;
        for (uint256 i; i <= last; ++i) {
            bool match_ = true;
            for (uint256 j; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }
}

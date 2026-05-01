// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";

import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";

import {Filler} from "../src/Filler.sol";
import {FillerBond} from "../src/FillerBond.sol";

/// @title Deploy
/// @notice Generic deploy script for `Filler.sol` + `FillerBond.sol`.
/// @dev Atomically transfers ownership to the configured multisig in the same broadcast.
///      Approvals are NOT configured here — that is a separate multisig transaction
///      (see `script/ConfigureApprovals.s.sol`).
///
///      The deployer key (`DEPLOYER_KEY`) is intentionally an ephemeral hot wallet:
///      it pays gas for the deploy + the ownership handover, and after that holds no
///      privilege over the contracts.
///
///      Required env vars (all addresses must be non-zero):
///        - `DEPLOYER_KEY`         — uint256 hex private key
///        - `POOL_MANAGER`         — chain's v4 PoolManager
///        - `UNISWAPX_REACTOR`     — chain's UniswapX Reactor
///        - `BOND_TREASURY`        — multisig that receives slashed funds
///        - `MULTISIG_OWNER`       — multisig that owns Filler + Bond after handover
///
///      Run:
///        forge script script/Deploy.s.sol --rpc-url $CHAIN --broadcast --verify -vvv
contract Deploy is Script {
    struct DeployConfig {
        address poolManager;
        address reactor;
        address treasury;
        address multisigOwner;
    }

    function run() external returns (Filler filler, FillerBond bond) {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        DeployConfig memory cfg = _loadConfigFromEnv();

        return runWithConfig(deployerKey, cfg);
    }

    /// @notice Deploys the contracts under an explicit config (testable entrypoint).
    /// @dev Validates the config, then deploys + hands over ownership in a single broadcast.
    function runWithConfig(
        uint256 deployerKey,
        DeployConfig memory cfg
    ) public returns (Filler filler, FillerBond bond) {
        validateConfig(cfg);

        vm.startBroadcast(deployerKey);

        // 1. Deploy Bond first so Filler can hold its address as immutable.
        bond = new FillerBond(cfg.treasury, cfg.reactor);

        // 2. Deploy Filler.
        filler = new Filler(IReactor(cfg.reactor), IPoolManager(cfg.poolManager), address(bond));

        // 3. Atomic handover: deployer is the owner only for this same tx, then transfers.
        bond.transferOwnership(cfg.multisigOwner);
        filler.transferOwnership(cfg.multisigOwner);

        vm.stopBroadcast();

        // 4. Persist deployment metadata for indexer / SDK / CI consumption.
        _writeDeployment(filler, bond, cfg);

        // 5. Emit human-readable summary.
        console.log("=== Filler SDK deployment ===");
        console.log("Chain ID         :", block.chainid);
        console.log("Filler           :", address(filler));
        console.log("FillerBond       :", address(bond));
        console.log("Owner (multisig) :", cfg.multisigOwner);
        console.log("Treasury         :", cfg.treasury);
        console.log("PoolManager      :", cfg.poolManager);
        console.log("Reactor          :", cfg.reactor);
    }

    /// @notice Validate that all four addresses are non-zero AND treasury != multisigOwner.
    /// @dev Pure (no env reads) — safe to call directly from tests.
    function validateConfig(
        DeployConfig memory cfg
    ) public pure {
        require(cfg.poolManager != address(0), "POOL_MANAGER must be non-zero");
        require(cfg.reactor != address(0), "UNISWAPX_REACTOR must be non-zero");
        require(cfg.treasury != address(0), "BOND_TREASURY must be non-zero");
        require(cfg.multisigOwner != address(0), "MULTISIG_OWNER must be non-zero");
        require(
            cfg.treasury != cfg.multisigOwner,
            "BOND_TREASURY must be a separate address from MULTISIG_OWNER"
        );
    }

    function _loadConfigFromEnv() internal view returns (DeployConfig memory cfg) {
        cfg.poolManager = vm.envAddress("POOL_MANAGER");
        cfg.reactor = vm.envAddress("UNISWAPX_REACTOR");
        cfg.treasury = vm.envAddress("BOND_TREASURY");
        cfg.multisigOwner = vm.envAddress("MULTISIG_OWNER");
    }

    function _writeDeployment(
        Filler filler,
        FillerBond bond,
        DeployConfig memory cfg
    ) internal {
        string memory chainId = vm.toString(block.chainid);
        string memory path = string.concat("deployments/", chainId, ".json");

        // Hand-rolled JSON to keep zero dependencies. Field order is stable so reviewers
        // can diff deploy artifacts across chains.
        string memory json = string.concat(
            "{\n",
            '  "chainId": ',
            chainId,
            ",\n",
            '  "filler": "',
            vm.toString(address(filler)),
            '",\n',
            '  "bond": "',
            vm.toString(address(bond)),
            '",\n',
            '  "poolManager": "',
            vm.toString(cfg.poolManager),
            '",\n',
            '  "reactor": "',
            vm.toString(cfg.reactor),
            '",\n',
            '  "treasury": "',
            vm.toString(cfg.treasury),
            '",\n',
            '  "owner": "',
            vm.toString(cfg.multisigOwner),
            '",\n',
            '  "deployedAt": ',
            vm.toString(block.timestamp),
            ",\n",
            '  "deployedBlock": ',
            vm.toString(block.number),
            "\n",
            "}\n"
        );

        // Writing deployment artifacts is the documented purpose of this script; the
        // forge cheatcode lint flags vm.writeFile as unsafe by default for safety.
        // forge-lint: disable-next-line(unsafe-cheatcode)
        vm.writeFile(path, json);
    }
}

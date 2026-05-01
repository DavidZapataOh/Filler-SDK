// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";

import {Filler} from "../src/Filler.sol";

/// @title ConfigureApprovals
/// @notice Generates the calldata for the multisig to call `Filler.configureApprovals`.
/// @dev Intended to be run *off-chain* by a Safe signer to obtain the calldata they paste
///      into Safe Transaction Builder. The script does NOT broadcast — it only logs.
///
///      Required env vars:
///        - `FILLER_ADDRESS`       — address of the deployed Filler
///        - `WHITELIST_CURRENCIES` — comma-separated address list, including `0x0000...0`
///                                   for native ETH if applicable
///
///      Run:
///        FILLER_ADDRESS=0x... \
///        WHITELIST_CURRENCIES="0x000...0,0xUSDC,0xWETH" \
///        forge script script/ConfigureApprovals.s.sol -vvv
contract ConfigureApprovals is Script {
    function run() external view {
        Filler filler = Filler(payable(vm.envAddress("FILLER_ADDRESS")));
        address[] memory raw = vm.envAddress("WHITELIST_CURRENCIES", ",");

        require(raw.length > 0, "WHITELIST_CURRENCIES must list at least one currency");

        Currency[] memory currencies = new Currency[](raw.length);
        for (uint256 i; i < raw.length; ++i) {
            currencies[i] = Currency.wrap(raw[i]);
        }

        bytes memory data = abi.encodeCall(filler.configureApprovals, (currencies));

        console.log("=== ConfigureApprovals calldata ===");
        console.log("Filler            :", address(filler));
        console.log("Whitelist length  :", raw.length);
        for (uint256 i; i < raw.length; ++i) {
            console.log("  currency        :", raw[i]);
        }
        console.log("");
        console.log("Multisig should submit a transaction:");
        console.log("  to    :", address(filler));
        console.log("  value : 0");
        console.log("  data  :");
        console.logBytes(data);
    }
}

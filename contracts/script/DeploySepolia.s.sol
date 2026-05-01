// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Deploy} from "./Deploy.s.sol";

/// @title DeploySepolia
/// @notice Sepolia-specific wrapper. Reads addresses from `.env.sepolia`.
/// @dev Run:
///        source .env.sepolia
///        forge script script/DeploySepolia.s.sol \
///          --rpc-url sepolia --broadcast --verify \
///          --etherscan-api-key $ETHERSCAN_API_KEY -vvv
///      Required env: DEPLOYER_KEY, POOL_MANAGER, UNISWAPX_REACTOR,
///      BOND_TREASURY, MULTISIG_OWNER. Sanity-checked in `Deploy._loadConfig`.
contract DeploySepolia is Deploy {}

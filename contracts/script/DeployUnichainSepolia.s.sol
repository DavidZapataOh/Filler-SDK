// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Deploy} from "./Deploy.s.sol";

/// @title DeployUnichainSepolia
/// @notice Unichain Sepolia wrapper. Reads addresses from `.env.unichain-sepolia`.
/// @dev Run:
///        source .env.unichain-sepolia
///        forge script script/DeployUnichainSepolia.s.sol \
///          --rpc-url unichain_sepolia --broadcast --verify \
///          --verifier sourcify -vvv
///      Etherscan API not required when verifying via Sourcify.
contract DeployUnichainSepolia is Deploy {}

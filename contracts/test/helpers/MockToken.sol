// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MockERC20} from "forge-std/mocks/MockERC20.sol";

/// @notice Mintable test ERC20.
contract MockToken is MockERC20 {
    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

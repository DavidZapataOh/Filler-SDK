// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Currency} from "@uniswap/v4-core/types/Currency.sol";

// =============================================================
//                      Filler.sol errors
// =============================================================

/// @notice Caller is not the authorized UniswapX Reactor.
error NotReactor(address caller);

/// @notice Caller is not the v4 PoolManager.
error NotPoolManager(address caller);

/// @notice FillParams failed validation (invalid ticks, zero amounts, expired deadline, etc.)
error InvalidFillParams();

/// @notice Currency deltas did not net to zero after unlock.
error DeltasNotZero(int256 delta0, int256 delta1);

/// @notice Reentrancy detected via transient guard.
error Reentrancy();

/// @notice configureApprovals called more than once.
error ApprovalsAlreadySetup();

/// @notice Currency is not whitelisted in the filler.
error UnsupportedCurrency(Currency currency);

/// @notice An address parameter is the zero address where it must be non-zero.
error InvalidAddress();

/// @notice The number of fill params does not match the number of resolved orders.
error FillParamsLengthMismatch(uint256 ordersLen, uint256 paramsLen);

// =============================================================
//                    FillerBond.sol errors
// =============================================================

/// @notice Stake amount insufficient for requested operation.
error NotEnoughStake();

/// @notice Cooldown period has not elapsed since unstake request.
error CooldownNotElapsed();

/// @notice No pending unstake request for this filler/staker pair.
error NoUnstakeRequest();

/// @notice Evidence provided does not match expected format.
error InvalidEvidence();

/// @notice This evidence hash has already been slashed.
error AlreadySlashed();

/// @notice Stake amount is zero (must be positive).
error ZeroStake();

/// @notice Direct ETH transfer to the bond contract is rejected — must use `stake()`.
error DirectETHRejected();

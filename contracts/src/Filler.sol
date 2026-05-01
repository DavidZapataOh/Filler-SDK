// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IReactorCallback} from "@uniswap/uniswapx/interfaces/IReactorCallback.sol";
import {ResolvedOrder} from "@uniswap/uniswapx/base/ReactorStructs.sol";

import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/interfaces/callback/IUnlockCallback.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/libraries/TickMath.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/libraries/TransientStateLibrary.sol";

import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {Ownable} from "solady/auth/Ownable.sol";

import {FillParams, FillParamsLib} from "./libraries/FillParams.sol";
import {DeltaSettler} from "./libraries/DeltaSettler.sol";
import {
    NotReactor,
    NotPoolManager,
    DeltasNotZero,
    Reentrancy,
    ApprovalsAlreadySetup,
    UnsupportedCurrency,
    InvalidAddress,
    FillParamsLengthMismatch
} from "./errors/Errors.sol";

/// @title Filler — UniswapX vertical filler with atomic JIT pattern
/// @author Filler SDK Contributors
/// @notice Receives intents from UniswapX Reactor, fills them by providing
///         just-in-time liquidity to a v4 pool, swapping through it, and
///         reclaiming the liquidity in the same transaction.
/// @dev IMMUTABLE — no upgradeability. New deployments + migration only.
///      See: docs/adr/0001-immutable-contracts.md
contract Filler is IReactorCallback, IUnlockCallback, Ownable {
    using CurrencyLibrary for Currency;
    using SafeTransferLib for address;
    using FillParamsLib for FillParams;
    using TransientStateLibrary for IPoolManager;

    // ============ Immutable state ============

    /// @notice The UniswapX Reactor authorized to call this filler.
    IReactor public immutable REACTOR;

    /// @notice The Uniswap v4 PoolManager.
    IPoolManager public immutable POOL_MANAGER;

    /// @notice The associated Bond contract (informational; slashing logic lives there).
    address public immutable BOND;

    // ============ Mutable state ============

    /// @notice One-time setup flag. Once true, approvals cannot be re-applied.
    bool public approvalsConfigured;

    /// @notice Whitelisted currencies that the filler will operate on.
    /// @dev Currencies must be standard ERC20 (no rebasing, no fee-on-transfer) or native ETH.
    mapping(Currency currency => bool allowed) public allowedCurrencies;

    /// @notice Transient reentrancy guard (Solidity 0.8.28+ transient storage).
    bool transient locked;

    // ============ Events ============

    event Filled(
        bytes32 indexed orderHash,
        address indexed user,
        Currency indexed inputCurrency,
        Currency outputCurrency,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 feesCaptured
    );

    event ApprovalsConfigured(uint256 currencyCount);
    event CurrencyAllowed(Currency indexed currency);
    event CurrencyDisallowed(Currency indexed currency);

    // ============ Modifiers ============

    modifier onlyReactor() {
        _onlyReactor();
        _;
    }

    modifier onlyPoolManager() {
        _onlyPoolManager();
        _;
    }

    modifier nonReentrant() {
        _nonReentrant();
        _;
        // Transient storage clears at tx end automatically; no manual unset required.
    }

    function _onlyReactor() internal view {
        if (msg.sender != address(REACTOR)) revert NotReactor(msg.sender);
    }

    function _onlyPoolManager() internal view {
        if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager(msg.sender);
    }

    function _nonReentrant() internal {
        if (locked) revert Reentrancy();
        locked = true;
    }

    // ============ Constructor ============

    constructor(
        IReactor _reactor,
        IPoolManager _poolManager,
        address _bond
    ) {
        if (address(_reactor) == address(0)) revert InvalidAddress();
        if (address(_poolManager) == address(0)) revert InvalidAddress();
        if (_bond == address(0)) revert InvalidAddress();

        REACTOR = _reactor;
        POOL_MANAGER = _poolManager;
        BOND = _bond;

        _initializeOwner(msg.sender);
    }

    // ============ Receive ============

    /// @notice Accepts native ETH from PoolManager (`take`) or Reactor (ETH outputs).
    receive() external payable {}

    // ============ Setup (one-time) ============

    /// @notice One-time setup: approve PoolManager + Reactor for whitelisted currencies.
    /// @dev After calling this, ownership can be renounced for trust-minimization.
    function configureApprovals(
        Currency[] calldata currencies
    ) external onlyOwner {
        if (approvalsConfigured) revert ApprovalsAlreadySetup();
        approvalsConfigured = true;

        uint256 len = currencies.length;
        for (uint256 i; i < len; ++i) {
            Currency c = currencies[i];

            if (!c.isAddressZero()) {
                address token = Currency.unwrap(c);
                token.safeApprove(address(POOL_MANAGER), type(uint256).max);
                token.safeApprove(address(REACTOR), type(uint256).max);
            }

            allowedCurrencies[c] = true;
            emit CurrencyAllowed(c);
        }

        emit ApprovalsConfigured(len);
    }

    // ============ Reactor callback ============

    /// @notice Called by UniswapX Reactor after transferring input tokens to this filler.
    /// @dev Must end with output tokens approved to the Reactor for transferFrom.
    ///      Interface mandates `memory` parameters (see IReactorCallback).
    function reactorCallback(
        ResolvedOrder[] memory resolvedOrders,
        bytes memory callbackData
    ) external onlyReactor nonReentrant {
        FillParams[] memory params = abi.decode(callbackData, (FillParams[]));
        if (params.length != resolvedOrders.length) {
            revert FillParamsLengthMismatch(resolvedOrders.length, params.length);
        }

        uint256 len = params.length;
        for (uint256 i; i < len; ++i) {
            _processOrder(resolvedOrders[i], params[i]);
        }
    }

    function _processOrder(
        ResolvedOrder memory order,
        FillParams memory p
    ) internal {
        p.validate();

        if (!allowedCurrencies[p.inputCurrency]) revert UnsupportedCurrency(p.inputCurrency);
        if (!allowedCurrencies[p.outputCurrency]) revert UnsupportedCurrency(p.outputCurrency);

        // Atomic JIT: nested unlock callback executes add → swap → remove → settle.
        POOL_MANAGER.unlock(abi.encode(p));

        emit Filled(
            order.hash,
            order.info.swapper,
            p.inputCurrency,
            p.outputCurrency,
            p.inputAmount,
            p.outputAmount,
            p.feesCaptured
        );
    }

    // ============ Unlock callback ============

    /// @notice Called by PoolManager during `unlock()`. Executes the JIT pattern atomically.
    /// @dev Must settle every currency delta to zero before returning.
    function unlockCallback(
        bytes calldata data
    ) external onlyPoolManager returns (bytes memory) {
        FillParams memory p = abi.decode(data, (FillParams));

        _addJitLiquidity(p);
        _swap(p);
        _removeJitLiquidity(p);
        DeltaSettler.settleAll(POOL_MANAGER, p.poolKey);
        _assertDeltasZero(p);

        return "";
    }

    function _addJitLiquidity(
        FillParams memory p
    ) internal {
        IPoolManager.ModifyLiquidityParams memory params = IPoolManager.ModifyLiquidityParams({
            tickLower: p.tickLower,
            tickUpper: p.tickUpper,
            liquidityDelta: int256(uint256(p.liquidityDelta)),
            salt: bytes32(uint256(uint160(address(this))))
        });

        // Returns (callerDelta, feesAccrued) — both flow through PoolManager's delta accounting.
        POOL_MANAGER.modifyLiquidity(p.poolKey, params, "");
    }

    function _swap(
        FillParams memory p
    ) internal returns (BalanceDelta) {
        IPoolManager.SwapParams memory swapParams = IPoolManager.SwapParams({
            zeroForOne: p.zeroForOne,
            // Negative amountSpecified = exactInput
            amountSpecified: -int256(p.inputAmount),
            sqrtPriceLimitX96: p.zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });

        return POOL_MANAGER.swap(p.poolKey, swapParams, "");
    }

    function _removeJitLiquidity(
        FillParams memory p
    ) internal {
        IPoolManager.ModifyLiquidityParams memory params = IPoolManager.ModifyLiquidityParams({
            tickLower: p.tickLower,
            tickUpper: p.tickUpper,
            liquidityDelta: -int256(uint256(p.liquidityDelta)),
            salt: bytes32(uint256(uint160(address(this))))
        });

        POOL_MANAGER.modifyLiquidity(p.poolKey, params, "");
    }

    function _assertDeltasZero(
        FillParams memory p
    ) internal view {
        int256 delta0 = POOL_MANAGER.currencyDelta(address(this), p.poolKey.currency0);
        int256 delta1 = POOL_MANAGER.currencyDelta(address(this), p.poolKey.currency1);
        if (delta0 != 0 || delta1 != 0) revert DeltasNotZero(delta0, delta1);
    }

    // ============ View helpers ============

    /// @notice Pre-flight check used by off-chain solvers: would this fill validate?
    /// @return ok True if validation would pass.
    /// @return reason Empty when ok; raw revert bytes from `validate()` otherwise.
    function quotedFillFor(
        FillParams calldata p
    ) external view returns (bool ok, bytes memory reason) {
        if (!allowedCurrencies[p.inputCurrency]) {
            return (false, abi.encode("input not whitelisted"));
        }
        if (!allowedCurrencies[p.outputCurrency]) {
            return (false, abi.encode("output not whitelisted"));
        }

        try this.validateExternal(p) {
            return (true, "");
        } catch (bytes memory err) {
            return (false, err);
        }
    }

    /// @dev External wrapper around `FillParams.validate()` so it can be `try/catch`-ed.
    function validateExternal(
        FillParams calldata p
    ) external view {
        FillParamsLib.validate(p);
    }

    // ============ Admin (operational only) ============

    /// @notice Add a currency to the whitelist post-setup.
    /// @dev Operational only — fill logic is immutable.
    function allowCurrency(
        Currency currency
    ) external onlyOwner {
        allowedCurrencies[currency] = true;

        if (!currency.isAddressZero()) {
            address token = Currency.unwrap(currency);
            token.safeApprove(address(POOL_MANAGER), type(uint256).max);
            token.safeApprove(address(REACTOR), type(uint256).max);
        }

        emit CurrencyAllowed(currency);
    }

    /// @notice Remove a currency from the whitelist + revoke approvals.
    function disallowCurrency(
        Currency currency
    ) external onlyOwner {
        allowedCurrencies[currency] = false;

        if (!currency.isAddressZero()) {
            address token = Currency.unwrap(currency);
            token.safeApprove(address(POOL_MANAGER), 0);
            token.safeApprove(address(REACTOR), 0);
        }

        emit CurrencyDisallowed(currency);
    }
}

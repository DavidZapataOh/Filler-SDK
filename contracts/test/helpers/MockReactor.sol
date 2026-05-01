// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    ResolvedOrder,
    OrderInfo,
    InputToken,
    OutputToken,
    SignedOrder
} from "@uniswap/uniswapx/base/ReactorStructs.sol";
import {IReactorCallback} from "@uniswap/uniswapx/interfaces/IReactorCallback.sol";
import {IReactor} from "@uniswap/uniswapx/interfaces/IReactor.sol";
import {IValidationCallback} from "@uniswap/uniswapx/interfaces/IValidationCallback.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @title MockReactor
/// @notice Lightweight UniswapX v2 Reactor stand-in for unit tests.
/// @dev Skips signature verification + Permit2 + dutch decay. Test code feeds
///      pre-resolved orders directly. Simulates the v2.1 fillContract = msg.sender
///      pattern: this contract calls `reactorCallback` on the caller, then pulls
///      output tokens from the caller via transferFrom.
contract MockReactor {
    /// @notice Caller of the most-recent `executeWithCallback` invocation. Tests use this to
    ///         assert that `Filler.execute(...)` reached the reactor with the Filler as
    ///         msg.sender (the v2.1 `fillContract`).
    address public lastFillContract;

    /// @notice Number of times `executeWithCallback` / `executeBatchWithCallback` was hit.
    uint256 public executeWithCallbackCount;

    /// @notice Real-shaped UniswapX entry point used by `Filler.execute(...)`. Decodes the
    ///         `order.order` bytes as an ABI-encoded `ResolvedOrder` (test convention) and
    ///         runs the standard pull-input → reactorCallback → pull-output flow.
    function executeWithCallback(
        SignedOrder calldata order,
        bytes calldata callbackData
    ) external payable {
        lastFillContract = msg.sender;
        executeWithCallbackCount += 1;

        ResolvedOrder[] memory orders = new ResolvedOrder[](1);
        orders[0] = abi.decode(order.order, (ResolvedOrder));
        _runFill(orders, callbackData);
    }

    /// @notice Batch variant. Decodes each `SignedOrder.order` as a `ResolvedOrder`.
    function executeBatchWithCallback(
        SignedOrder[] calldata orders_,
        bytes calldata callbackData
    ) external payable {
        lastFillContract = msg.sender;
        executeWithCallbackCount += 1;

        uint256 n = orders_.length;
        ResolvedOrder[] memory resolved = new ResolvedOrder[](n);
        for (uint256 i; i < n; ++i) {
            resolved[i] = abi.decode(orders_[i].order, (ResolvedOrder));
        }
        _runFill(resolved, callbackData);
    }

    function _runFill(
        ResolvedOrder[] memory orders,
        bytes memory callbackData
    ) internal {
        address fillContract = lastFillContract;

        for (uint256 i; i < orders.length; ++i) {
            ResolvedOrder memory o = orders[i];
            bool ok = ERC20(address(o.input.token))
                .transferFrom(o.info.swapper, fillContract, o.input.amount);
            require(ok, "MockReactor: input transferFrom failed");
        }

        IReactorCallback(fillContract).reactorCallback(orders, callbackData);

        for (uint256 i; i < orders.length; ++i) {
            ResolvedOrder memory o = orders[i];
            for (uint256 j; j < o.outputs.length; ++j) {
                OutputToken memory out = o.outputs[j];
                if (out.token == address(0)) {
                    revert("MockReactor: native output unsupported");
                }
                bool ok = ERC20(out.token).transferFrom(fillContract, out.recipient, out.amount);
                require(ok, "MockReactor: output transferFrom failed");
            }
        }
    }

    /// @notice Execute a batch of pre-resolved orders against `msg.sender` (the fillContract).
    /// @dev Performs the v2.1 reactor steps:
    ///        1. Move each order's input from `info.swapper` to `msg.sender` via transferFrom.
    ///           (Test code must pre-approve this MockReactor to spend the swapper's input.)
    ///        2. Call `msg.sender.reactorCallback(orders, callbackData)`.
    ///        3. For each order, pull each output amount from `msg.sender` to `output.recipient`
    ///           via transferFrom.
    function executeResolvedBatch(
        ResolvedOrder[] memory orders,
        bytes memory callbackData
    ) external payable {
        address fillContract = msg.sender;

        // 1) Move inputs from swapper → fillContract.
        for (uint256 i; i < orders.length; ++i) {
            ResolvedOrder memory o = orders[i];
            bool ok = ERC20(address(o.input.token))
                .transferFrom(o.info.swapper, fillContract, o.input.amount);
            require(ok, "MockReactor: input transferFrom failed");
        }

        // 2) Callback into the filler.
        IReactorCallback(fillContract).reactorCallback(orders, callbackData);

        // 3) Pull outputs from fillContract → recipient.
        for (uint256 i; i < orders.length; ++i) {
            ResolvedOrder memory o = orders[i];
            for (uint256 j; j < o.outputs.length; ++j) {
                OutputToken memory out = o.outputs[j];
                if (out.token == address(0)) {
                    // Native ETH path is not supported by this mock; fillers handle WETH.
                    revert("MockReactor: native output unsupported");
                }
                bool ok = ERC20(out.token).transferFrom(fillContract, out.recipient, out.amount);
                require(ok, "MockReactor: output transferFrom failed");
            }
        }
    }

    /// @notice Convenience: build a `ResolvedOrder` skeleton with a single input + output.
    function buildOrder(
        address swapper,
        address inputToken,
        uint256 inputAmount,
        address outputToken,
        uint256 outputAmount,
        address outputRecipient,
        uint256 deadline,
        bytes32 orderHash
    ) external view returns (ResolvedOrder memory order) {
        OutputToken[] memory outputs = new OutputToken[](1);
        outputs[0] =
            OutputToken({token: outputToken, amount: outputAmount, recipient: outputRecipient});

        order = ResolvedOrder({
            info: OrderInfo({
                reactor: IReactor(address(this)),
                swapper: swapper,
                nonce: 0,
                deadline: deadline,
                additionalValidationContract: IValidationCallback(address(0)),
                additionalValidationData: ""
            }),
            input: InputToken({
                token: ERC20(inputToken), amount: inputAmount, maxAmount: inputAmount
            }),
            outputs: outputs,
            sig: "",
            hash: orderHash
        });
    }
}

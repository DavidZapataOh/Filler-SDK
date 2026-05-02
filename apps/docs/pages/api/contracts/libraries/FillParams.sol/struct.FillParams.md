# FillParams
[Git Source](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/src/libraries/FillParams.sol)

Parameters for a single fill, calculated off-chain by the SDK.

Off-chain SDK computes optimal tickLower / tickUpper / liquidityDelta and
packages them into this struct, signed and submitted via UniswapX Reactor.
All fields are validated on-chain in `FillParamsLib.validate()`.


```solidity
struct FillParams {
/// @notice The v4 pool to route the swap through.
PoolKey poolKey;
/// @notice The currency the user is sending in (input).
Currency inputCurrency;
/// @notice The currency the user wants out (output).
Currency outputCurrency;
/// @notice Amount of inputCurrency the user is providing.
uint256 inputAmount;
/// @notice Minimum amount of outputCurrency the user expects.
uint256 outputAmount;
/// @notice Direction of the swap through the pool (currency0 → currency1?).
bool zeroForOne;
/// @notice Lower bound of the JIT liquidity range (must align to tickSpacing).
int24 tickLower;
/// @notice Upper bound of the JIT liquidity range.
int24 tickUpper;
/// @notice Liquidity to add (and later remove) for JIT.
uint128 liquidityDelta;
/// @notice Estimated fees captured by JIT (used in events for analytics).
uint256 feesCaptured;
/// @notice Deadline beyond which fill is invalid.
uint256 deadline;
}
```


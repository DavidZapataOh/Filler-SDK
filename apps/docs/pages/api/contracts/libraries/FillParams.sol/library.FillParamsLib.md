# FillParamsLib
[Git Source](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/src/libraries/FillParams.sol)


## Functions
### validate

Validates that fill params are well-formed.

Reverts with `InvalidFillParams` on any check failure.


```solidity
function validate(
    FillParams memory p
) internal view;
```


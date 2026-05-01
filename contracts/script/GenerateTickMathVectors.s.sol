// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {TickMath} from "@uniswap/v4-core/libraries/TickMath.sol";

/// @title GenerateTickMathVectors
/// @notice Emit a JSON fixture of `(tick, sqrtPriceX96)` pairs from v4-core's TickMath.
///         Consumed by `packages/jit-hints/test/depth/tickMath.fixtures.test.ts`
///         to prove the TS port matches the Solidity reference for every
///         sampled tick.
///
/// @dev Output path: `../packages/jit-hints/test/fixtures/tickMathVectors.json`.
///      Run:  forge script script/GenerateTickMathVectors.s.sol
///      The fs_permissions block in `foundry.toml` allows writing to that path.
///
///      Sampling strategy: edges (MIN_TICK, MAX_TICK), dense around tick=0
///      (where most production pools live), log-spaced through the rest of
///      the range, plus a deterministic spread of mid-range ticks so we hit
///      a variety of bit patterns through the magic-constant chain in
///      `getSqrtPriceAtTick`.
contract GenerateTickMathVectors is Script {
    function run() external {
        int24[] memory ticks = _sampleTicks();

        string memory json = "[\n";
        uint256 n = ticks.length;
        for (uint256 i; i < n; ++i) {
            int24 t = ticks[i];
            uint160 sqrtPrice = TickMath.getSqrtPriceAtTick(t);
            json = string.concat(
                json,
                '  { "tick": ',
                vm.toString(int256(t)),
                ', "sqrtPriceX96": "',
                vm.toString(uint256(sqrtPrice)),
                '" }',
                i == n - 1 ? "\n" : ",\n"
            );
        }
        json = string.concat(json, "]\n");

        // forge-lint: disable-next-line(unsafe-cheatcode)
        vm.writeFile("../packages/jit-hints/test/fixtures/tickMathVectors.json", json);
        console.log("wrote", n, "vectors to packages/jit-hints/test/fixtures/tickMathVectors.json");
    }

    /// @dev Returns a deterministic, well-distributed sample of ticks.
    function _sampleTicks() internal pure returns (int24[] memory) {
        // Edges + small ticks around 0 + log-spaced + deterministic spread.
        int24[] memory base = new int24[](42);
        base[0] = TickMath.MIN_TICK;
        base[1] = TickMath.MIN_TICK + 1;
        base[2] = TickMath.MIN_TICK + 60;
        base[3] = -500_000;
        base[4] = -200_000;
        base[5] = -100_000;
        base[6] = -50_000;
        base[7] = -10_000;
        base[8] = -1_000;
        base[9] = -120;
        base[10] = -60;
        base[11] = -3;
        base[12] = -2;
        base[13] = -1;
        base[14] = 0;
        base[15] = 1;
        base[16] = 2;
        base[17] = 3;
        base[18] = 60;
        base[19] = 120;
        base[20] = 1_000;
        base[21] = 10_000;
        base[22] = 50_000;
        base[23] = 100_000;
        base[24] = 200_000;
        base[25] = 500_000;
        base[26] = TickMath.MAX_TICK - 60;
        base[27] = TickMath.MAX_TICK - 1;
        base[28] = TickMath.MAX_TICK;

        // Powers of two inside the valid range — exercise individual magic-constant bits.
        base[29] = 1; // 2^0
        base[30] = 2; // 2^1
        base[31] = 4;
        base[32] = 8;
        base[33] = 16;
        base[34] = 32;
        base[35] = 64;
        base[36] = 128;
        base[37] = 256;
        base[38] = 512;
        base[39] = 1024;
        base[40] = 16_384; // 2^14
        base[41] = 524_288; // 2^19 — last bit consumed by the magic chain

        // Deterministic spread (keccak-style) inside [-MAX_TICK, MAX_TICK].
        // Casts are bounded by construction: `t` is in (-MAX_TICK, MAX_TICK), well inside int24.
        // forge-lint: disable-start(unsafe-typecast)
        int24[] memory spread = new int24[](32);
        for (uint256 i; i < 32; ++i) {
            uint256 h = uint256(keccak256(abi.encode("tickMathVector", i)));
            int256 t = int256(h % uint256(int256(2 * TickMath.MAX_TICK)))
                - int256(TickMath.MAX_TICK);
            spread[i] = int24(t);
        }
        // forge-lint: disable-end(unsafe-typecast)

        // Concat base + spread.
        int24[] memory out = new int24[](base.length + spread.length);
        for (uint256 i; i < base.length; ++i) out[i] = base[i];
        for (uint256 i; i < spread.length; ++i) out[base.length + i] = spread[i];
        return out;
    }
}

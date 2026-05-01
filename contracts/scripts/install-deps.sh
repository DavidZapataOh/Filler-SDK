#!/usr/bin/env bash
# Install Foundry dependencies pinned to specific commits for reproducibility.
# Run once after fresh clone: bash contracts/scripts/install-deps.sh
#
# These pins were captured 2026-05-01. Update them only with a tracked PR
# (security review required since v4-core/v4-periphery do not yet have
# semver releases — pin moves are a trust event).

set -euo pipefail

cd "$(dirname "$0")/.."

# === Pinned refs ===
# (commit hash captured at the time of installation — copy from .gitmodules
# `git ls-tree HEAD lib/<name>` to verify reproduced)
FORGE_STD_TAG="v1.9.4"
SOLADY_TAG="v0.1.9"
V4_CORE_TAG="v4.0.0"
V4_PERIPHERY_COMMIT="9dafaaecc1e2e1e824eda9d941085f96517d827b"
UNISWAPX_TAG="v2.1.0"
PERMIT2_COMMIT="cc56ad0f3439c502c246fc5cfcc3db92bb8b7219"

# Clean any prior partial installs
rm -rf lib
mkdir lib

forge install foundry-rs/forge-std@$FORGE_STD_TAG
forge install Vectorized/solady@$SOLADY_TAG
forge install Uniswap/v4-core@$V4_CORE_TAG
forge install Uniswap/v4-periphery@$V4_PERIPHERY_COMMIT
forge install Uniswap/UniswapX@$UNISWAPX_TAG
forge install Uniswap/permit2@$PERMIT2_COMMIT

echo ""
echo "✓ All dependencies installed. Verifying compile..."
forge build --sizes
echo "✓ Compile clean."

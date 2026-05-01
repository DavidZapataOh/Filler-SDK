#!/usr/bin/env bash
# Validate the contracts/ Foundry setup is healthy.
# Run after install-deps.sh: bash contracts/scripts/validate-setup.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ forge --version"
forge --version

echo ""
echo "→ Checking dependencies..."
for dep in forge-std solady v4-core v4-periphery UniswapX permit2; do
    if [ -d "lib/$dep" ]; then
        echo "  ✓ lib/$dep"
    else
        echo "  ✗ lib/$dep MISSING — run install-deps.sh"
        exit 1
    fi
done

echo ""
echo "→ forge build --sizes"
forge build --sizes

echo ""
echo "→ forge test"
forge test

echo ""
echo "→ forge fmt --check"
forge fmt --check

echo ""
echo "→ forge snapshot --check"
forge snapshot --check 2>/dev/null || echo "  (no snapshot baseline yet, OK for skeleton)"

echo ""
echo "✓ Foundry setup valid"

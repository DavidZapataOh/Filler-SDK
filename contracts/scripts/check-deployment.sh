#!/usr/bin/env bash
# Idempotency guard for `forge script Deploy.s.sol`.
#
# Usage:
#   ./scripts/check-deployment.sh <chain-rpc-alias>
#
# Examples:
#   ./scripts/check-deployment.sh sepolia
#   ./scripts/check-deployment.sh unichain_sepolia
#
# Behavior:
#   - If `deployments/<chainId>.json` exists AND the recorded addresses still have
#     bytecode on-chain, exit 0 (skip deploy).
#   - Otherwise exit 1 (caller should proceed with `forge script ... --broadcast`).
#
# Requires: jq, cast.

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 <chain-rpc-alias>" >&2
    exit 2
fi

RPC_ALIAS="$1"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname -- "$SCRIPT_DIR")"

# Resolve chain id from the alias via cast (uses foundry.toml [rpc_endpoints]).
CHAIN_ID=$(cast chain-id --rpc-url "$RPC_ALIAS" 2>/dev/null || true)
if [[ -z "$CHAIN_ID" ]]; then
    echo "error: could not resolve chain id for rpc alias '$RPC_ALIAS'" >&2
    echo "       check your foundry.toml [rpc_endpoints] section + RPC env vars" >&2
    exit 2
fi

DEPLOYMENT_FILE="$CONTRACTS_DIR/deployments/$CHAIN_ID.json"

if [[ ! -f "$DEPLOYMENT_FILE" ]]; then
    echo "no deployment file for chain $CHAIN_ID — proceed with deploy"
    exit 1
fi

FILLER=$(jq -r '.filler' "$DEPLOYMENT_FILE")
BOND=$(jq -r '.bond' "$DEPLOYMENT_FILE")

if [[ -z "$FILLER" || "$FILLER" == "null" || -z "$BOND" || "$BOND" == "null" ]]; then
    echo "deployment file $DEPLOYMENT_FILE is malformed (missing filler/bond)"
    exit 2
fi

echo "Existing deployment recorded for chain $CHAIN_ID:"
echo "  Filler: $FILLER"
echo "  Bond:   $BOND"
echo ""
echo "Verifying bytecode on chain..."

# `cast code` returns "0x" for an address with no code; treat that as a stale record.
FILLER_CODE_LEN=$(cast code "$FILLER" --rpc-url "$RPC_ALIAS" | wc -c | tr -d ' ')
BOND_CODE_LEN=$(cast code "$BOND" --rpc-url "$RPC_ALIAS" | wc -c | tr -d ' ')

# "0x" plus newline = 3 chars; anything > 3 means there's actual bytecode.
if [[ "$FILLER_CODE_LEN" -le 3 || "$BOND_CODE_LEN" -le 3 ]]; then
    echo "warn: deployment record exists but bytecode is missing on chain"
    echo "      filler bytes: $FILLER_CODE_LEN, bond bytes: $BOND_CODE_LEN"
    echo "      treat as un-deployed (or stale record); proceed with deploy"
    exit 1
fi

echo "✓ Existing deployment verified on chain $CHAIN_ID. Skip deploy."
exit 0

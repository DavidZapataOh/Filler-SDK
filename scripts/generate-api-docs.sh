#!/usr/bin/env bash
# Sprint 06 Plan 04 — generate auto-derived API docs.
#
# Runs `forge doc` for the Solidity contracts and copies the markdown into
# apps/docs/pages/api/contracts/ (flattening forge's nested src/src/ output
# so Vocs URLs are clean). Also runs TypeDoc for the SDK.
#
# Re-run whenever Filler.sol / FillerBond.sol / SDK exports change.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS_DIR="${REPO_ROOT}/contracts"
DOC_OUT="${CONTRACTS_DIR}/doc-out"
PUBLISH_DIR="${REPO_ROOT}/apps/docs/pages/api/contracts"

echo "→ forge doc → ${DOC_OUT}"
cd "${CONTRACTS_DIR}"
rm -rf "${DOC_OUT}"
forge doc --build --out "${DOC_OUT}" >/dev/null

echo "→ flattening src/src/ → ${PUBLISH_DIR}"
rm -rf "${PUBLISH_DIR}"
mkdir -p "${PUBLISH_DIR}"
# forge doc nests under doc-out/src/src/<contract.sol>/<thing>.md
# We want apps/docs/pages/api/contracts/<contract.sol>/<thing>.md
if [[ -d "${DOC_OUT}/src/src" ]]; then
  cp -R "${DOC_OUT}/src/src/"* "${PUBLISH_DIR}/"
fi
# README at the source root becomes our index
if [[ -f "${DOC_OUT}/src/src/README.md" ]]; then
  cp "${DOC_OUT}/src/src/README.md" "${PUBLISH_DIR}/index.md"
fi

echo "→ cleaning intermediate forge doc-out (book/ etc.)"
rm -rf "${DOC_OUT}"

echo "→ pruning empty README.md files (forge generates one per dir)"
find "${PUBLISH_DIR}" -name "README.md" -type f -delete || true

# index.md from forge has absolute /src/* links that don't resolve in Vocs;
# the curated apps/docs/pages/api/contracts.mdx is the proper landing.
rm -f "${PUBLISH_DIR}/index.md"

echo ""
echo "✓ Contracts API docs generated:"
find "${PUBLISH_DIR}" -name "*.md" | sort | sed "s|${PUBLISH_DIR}/|  |"

echo ""
echo "→ TypeDoc → apps/docs/pages/api/sdk/"
# MDX-safe options:
#  --useCodeBlocks          → signatures/declarations wrapped in code fences (no JSX parsing)
#  --useHTMLEncodedBrackets → remaining < / > as &lt; &gt; (covers inline type refs)
#  --hidePageHeader         → less duplication with the curated landing
SDK_OUT="${REPO_ROOT}/apps/docs/pages/api/sdk"
SDK_LANDING="${REPO_ROOT}/apps/docs/pages/api/sdk.mdx"

# Preserve the curated landing if it exists (we'll restore after TypeDoc clears the dir)
LANDING_BACKUP=""
if [[ -f "${SDK_LANDING}" ]]; then
  LANDING_BACKUP="$(cat "${SDK_LANDING}")"
fi

rm -rf "${SDK_OUT}"
cd "${REPO_ROOT}/packages/sdk"
bunx typedoc \
  --plugin typedoc-plugin-markdown \
  --out "${SDK_OUT}" \
  --readme none \
  --githubPages false \
  --hideGenerator \
  --hidePageHeader \
  --excludePrivate \
  --excludeProtected \
  --excludeInternal \
  --useCodeBlocks \
  --useHTMLEncodedBrackets \
  --entryPoints src/index.ts \
  --entryPoints src/testing/index.ts \
  --entryPoints src/bond/index.ts \
  --entryPoints src/keeperhub/index.ts \
  >/dev/null

# Belt-and-suspenders post-processor for MDX-safety.
# typedoc-plugin-markdown's --useCodeBlocks + --useHTMLEncodedBrackets handle
# most cases, but some patterns leak into prose:
#   - Stray `{` / `}` outside code fences → MDX treats as JSX expression
#   - `<` followed by digit / `=` / etc. (e.g. "<50 ms") → MDX parses as JSX tag
# We escape both safely.
echo "→ post-processing TypeDoc output for MDX-safety"
find "${SDK_OUT}" -name "*.md" -type f | while read -r f; do
  awk '
    /^```/ { in_code = !in_code; print; next }
    !in_code {
      gsub(/\{/, "\\&#123;")
      gsub(/\}/, "\\&#125;")
      # Escape "<" when followed by a non-letter, non-slash, non-! char (won t start a JSX tag).
      # MDX treats <Foo /> as JSX but <50 as parse error. Escape only the latter.
      gsub(/<([^a-zA-Z!\/])/, "\\&lt;\\1")
    }
    { print }
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done

# Restore the curated sdk.mdx landing (TypeDoc replaced it with its own README.md
# in the sdk/ subdirectory; sdk.mdx remains as the /api/sdk route)
if [[ -n "${LANDING_BACKUP}" ]]; then
  echo "${LANDING_BACKUP}" > "${SDK_LANDING}"
  echo "✓ Restored curated sdk.mdx landing"
fi

echo "✓ SDK TypeDoc reference generated at ${SDK_OUT}"
echo "  $(find "${SDK_OUT}" -name "*.md" | wc -l | tr -d ' ') markdown files"

echo ""
echo "✓ Done. Re-run \`bun run --filter @filler-sdk/docs build\` to render."

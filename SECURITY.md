# Security Policy

Filler SDK ships smart contracts and off-chain solver infrastructure that handle real value (UniswapX intents, bonded stake). Security disclosures are taken seriously.

## Reporting a vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Report via one of:

1. **Private security advisory** (preferred): https://github.com/DavidZapataOh/filler-sdk/security/advisories/new
2. **Email**: **security@filler-sdk.xyz** (PGP key below)

We aim to:

- **Acknowledge** within **48 hours**
- Provide a **fix or mitigation timeline** within **7 days** for critical issues

### Severity classification

| Severity | Description | Initial response |
|---|---|---|
| **Critical** | Direct loss of user funds; total contract compromise; governance takeover | 24h |
| **High** | Indirect loss of funds; privilege escalation; bond mechanism bypass | 48h |
| **Medium** | Significant DoS; integrity issue without fund loss; front-running primitives | 5 days |
| **Low** | Limited impact; info disclosure; minor DX bugs with security flavor | 14 days |

### What to include in your report

- A description of the issue
- Steps to reproduce, or a Proof of Concept
- Affected components (contract address, package, version, commit SHA)
- Suggested mitigation if known
- Whether you'd like public credit (default: yes, with name + handle)

### What NOT to do

- Don't exploit the vulnerability on mainnet (or testnet against real funds)
- Don't share details publicly until coordinated disclosure
- Don't request a bounty before reporting (see [Bug bounty](#bug-bounty) below)

## Disclosure policy

We follow **coordinated disclosure**:

1. Reporter sends details to security@filler-sdk.xyz or via security advisory
2. We acknowledge within 48h
3. We work with the reporter to verify + develop a fix
4. Fix is deployed (if mainnet)
5. Public advisory + CVE assigned (if applicable)
6. Reporter credited (unless they request otherwise)

**Standard timeline**: 90 days from initial report to public disclosure. Accelerated disclosure for actively exploited vulnerabilities.

## PGP key

A PGP key for security@filler-sdk.xyz will be published here once generated. Until then, GitHub's Security Advisory mechanism (which encrypts at rest) is the most secure channel.

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
[Key fingerprint to be added — see Issue #001]
-----END PGP PUBLIC KEY BLOCK-----
```

## Bug bounty

A formal bug bounty program will launch **post-mainnet** (target: Q3 2026 — see [`PROYECTO_OPENSOLVER.md`](../PROYECTO_OPENSOLVER.md) §16 Roadmap).

**Pre-mainnet** (current state — alpha/beta phases):

- **Recognition**: public credit + Hall of Fame entry on the docs site
- **Discretionary rewards**: for high-impact reports during alpha/beta phases (USD 100–5,000 range)

**Once mainnet** (post-launch), the program will be hosted on [Immunefi](https://immunefi.com) (or equivalent) with rewards scaled to severity:

| Severity | Reward range (USD) |
|---|---|
| Critical | $10,000 – $100,000 |
| High | $5,000 – $25,000 |
| Medium | $1,000 – $5,000 |
| Low | $100 – $1,000 |

Final rewards subject to bounty program terms (eligibility, scope, etc.).

## Scope

### In scope

- **Smart contracts**: `Filler.sol`, `FillerBond.sol`, supporting libraries in `contracts/src/`
- **npm packages**: `@filler-sdk/sdk`, `@filler-sdk/jit-hints`, `create-filler`
- **Reference solvers**: `examples/*` (where they affect security of generated user code)
- **CLI templates**: `packages/cli/templates/*`
- **Release pipeline**: anything that could compromise the supply chain (e.g., a malicious dependency slipping into a release)

### Out of scope

- **Third-party dependencies** — report directly to those projects (we will help coordinate)
- **Demo dashboard** (`apps/dashboard`) — not security-critical, no real funds touched
- **Documentation site** (`apps/docs`) — informational only
- **DoS attacks requiring already-privileged access** (e.g., the multisig signer being malicious is not a vulnerability — it's a trust assumption documented in PRINCIPLES.md)
- **Issues in unsupported chains** — see `chains.ts` for the supported list

## Known limitations (documented, not bugs)

These are deliberately accepted trade-offs, **not vulnerabilities**:

- **Bond v0 owner-controlled slashing** — the multisig owner submits evidence to slash. v1 (Q4 2026) introduces trustless slashing via Reactor event proof. See `docs/adr/0002-bond-v0-owner-slash.md` (added in Sprint 01).
- **Hooks adversariales en target pool** — handled via simulation pre-flight + whitelist of known-benign pools. Edge cases documented in `Filler.sol` natspec.
- **Rebasing tokens / fee-on-transfer tokens** — explicitly unsupported. Whitelist enforced via `allowedCurrencies` mapping.
- **MEV during fill submission on public mempool** — mitigated via private routing (KeeperHub integration). Without private routing, fills are public-mempool-visible by design.

## Security practices we follow

- All commits must pass CI (Slither, CodeQL, tests, gas snapshot)
- Multisig ownership of all deployed contracts (2/3 minimum, 3/5 for mainnet)
- No upgradeable contracts in v0 (see [ADR 0001](./docs/adr/0001-immutable-contracts.md))
- npm packages published with [provenance](https://docs.npmjs.com/generating-provenance-statements) — verify on npm registry
- Dependency scanning via Dependabot + CodeQL (security-extended queries)
- All Foundry submodules pinned to specific commit hashes (see `contracts/scripts/install-deps.sh`)
- Security review gate on every contract PR before merge

## Hall of Fame

Researchers who have responsibly disclosed vulnerabilities to Filler SDK:

*(empty — be the first!)*

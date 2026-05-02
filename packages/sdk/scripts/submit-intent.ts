/**
 * submit-intent.ts — Sprint 5.5 Plan 04 deliverable.
 *
 * Constructs a UniswapX V2DutchOrder + signs via Permit2 (EIP-712) + (optionally)
 * broadcasts to the Reactor by calling our deployed Filler.execute. Stand-in
 * for a real DAO Safe operator submitting an intent for our solver to fill.
 *
 * Usage:
 *
 *   bun packages/sdk/scripts/submit-intent.ts \
 *     --input USDC --output WETH --size 100 --decay 30 \
 *     [--submit]                                    # add --submit to actually broadcast
 *
 * Flags:
 *   --input <symbol>     USDC | WETH | ETH (the swapper sells this)
 *   --output <symbol>    USDC | WETH | ETH (the swapper buys this)
 *   --size <decimal>     Amount of input (in human units, e.g. "100" USDC)
 *   --decay <seconds>    Dutch auction decay window length (default 30)
 *   --submit             Broadcast Filler.execute(SignedOrder, callbackData) on the fork
 *   --rpc <url>          Override RPC (default: http://localhost:8545 for the fork)
 *   --chain <id>         Override chain ID (default: 31337 for fork)
 *
 * Environment:
 *   SWAPPER_PRIVATE_KEY   The swapper's key. Defaults to anvil account #0
 *                         (well-known key — only safe on local fork).
 *
 * Honest scope notes:
 *
 *   1. The signing path is the architecturally novel piece this script proves.
 *      Signature is recovered + verified via Permit2's EIP-712 domain before
 *      we attempt any on-chain action.
 *
 *   2. The `--submit` path calls Filler.execute (our contract). For the submit
 *      to succeed end-to-end:
 *        - The swapper has approved Permit2 for the input token (script
 *          auto-fixes if missing).
 *        - The output token has a v4 pool with non-trivial liquidity at the
 *          target tick range.
 *        - The FillParams[] (callbackData) match the actual pool state.
 *
 *      This script ships PLACEHOLDER FillParams (a reasonable USDC/WETH 0.05%
 *      v4 pool config) for proof-of-shape. Real FillParams come from the SDK's
 *      tickCalibration (Sprint 03 P05) running against indexer depth data
 *      (Sprint 02 P04). For Sprint 5.5 Plan 04 acceptance, "tx hash printed"
 *      is sufficient — whether that tx succeeds or reverts is documented as
 *      a Plan 06 (E2E validation) concern.
 *
 *   3. Cosigner = swapper (self-cosign). V2DutchOrderReactor._validateOrder
 *      ALWAYS requires a valid cosignature — no short-circuit for cosigner=0x0
 *      (an `abi.decode("0x", (bytes32, bytes32))` panic would revert before
 *      the check). For "open" orders without a real RFQ cosigner service,
 *      the swapper signs as both swapper (Permit2 typed-data) AND cosigner
 *      (raw ECDSA over `keccak256(orderHash || abi.encode(cosignerData))`).
 *      This is legally valid — cosigner can be any address. See FEEDBACK F-61.
 */

import { parseAbi, type Address, type Hex } from 'viem';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  isHex,
  recoverAddress,
  recoverTypedDataAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { V2DutchOrderBuilder } from '@uniswap/uniswapx-sdk';
import { BigNumber } from 'ethers';

// === Constants — mainnet addresses (preserved on the fork) ===============

const ADDRESSES = {
  reactor: '0x00000011f84b9aa48e5f8aa8b9897600006289be' as Address,
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  poolManager: '0x000000000004444c5dc75cb358380d2e3de08a90' as Address,
  // Our deployed Filler from Sprint 5.5 Plan 02 (anvil deployer + nonce 1)
  filler: '0xC489d11D03B2999A6ba568e02E0b95eFc58b6A34' as Address,
  // Tokens
  usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address,
  weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as Address,
  native: '0x0000000000000000000000000000000000000000' as Address,
} as const;

// Token symbol → on-chain address + decimals
const TOKENS = {
  USDC: { address: ADDRESSES.usdc, decimals: 6 },
  WETH: { address: ADDRESSES.weth, decimals: 18 },
  ETH: { address: ADDRESSES.native, decimals: 18 },
} as const;
type TokenSymbol = keyof typeof TOKENS;

// Anvil dev account #0 well-known key. ONLY safe for local fork.
const DEFAULT_SWAPPER_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;

// === CLI parsing =========================================================

interface CliArgs {
  input: TokenSymbol;
  output: TokenSymbol;
  sizeHuman: string;
  decaySec: number;
  submit: boolean;
  rpcUrl: string;
  chainId: number;
}

function parseCli(argv: readonly string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  const input = (args['input'] ?? 'USDC') as TokenSymbol;
  const output = (args['output'] ?? 'WETH') as TokenSymbol;
  if (!(input in TOKENS) || !(output in TOKENS)) {
    throw new Error(`Unknown token. Valid: ${Object.keys(TOKENS).join(', ')}`);
  }
  if (input === output) {
    throw new Error('input and output tokens must differ');
  }
  return {
    input,
    output,
    sizeHuman: String(args['size'] ?? '100'),
    decaySec: Number(args['decay'] ?? 30),
    submit: args['submit'] === true,
    rpcUrl: String(args['rpc'] ?? 'http://localhost:8545'),
    chainId: Number(args['chain'] ?? 31_337),
  };
}

// === Helpers =============================================================

function bn(value: bigint | number | string): BigNumber {
  return BigNumber.from(typeof value === 'bigint' ? value.toString() : value);
}

function toUnits(human: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = human.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole + padded);
}

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]);

const FILLER_EXECUTE_ABI = parseAbi([
  'struct SignedOrder { bytes order; bytes sig; }',
  'function execute(SignedOrder calldata order, bytes calldata callbackData) external payable',
]);

// === Main ================================================================

async function main(): Promise<void> {
  const args = parseCli(Bun.argv.slice(2));
  const swapperKey = (process.env['SWAPPER_PRIVATE_KEY'] ?? DEFAULT_SWAPPER_KEY) as Hex;
  if (!isHex(swapperKey) || swapperKey.length !== 66) {
    throw new Error('SWAPPER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex');
  }

  const swapper = privateKeyToAccount(swapperKey);
  const inputToken = TOKENS[args.input];
  const outputToken = TOKENS[args.output];
  const sizeWei = toUnits(args.sizeHuman, inputToken.decimals);

  const transport = http(args.rpcUrl);
  const publicClient = createPublicClient({ chain: foundry, transport });
  const walletClient = createWalletClient({ chain: foundry, transport, account: swapper });

  console.log('--- swapper ---');
  console.log('address      :', swapper.address);
  console.log('input        :', args.input, sizeWei.toString(), 'wei');
  console.log('output       :', args.output);
  console.log('decay window :', args.decaySec, 'sec');
  console.log('submit       :', args.submit);
  console.log('chain        :', args.chainId, '@', args.rpcUrl);
  console.log();

  // === Build the V2DutchOrder ============================================

  const now = Math.floor(Date.now() / 1000);
  const decayStart = now + 5; // small grace before decay starts
  const decayEnd = decayStart + args.decaySec;
  const deadline = decayEnd + 60; // after decay ends, order valid for one more minute

  // Output amount: input * 99% (1% spread), scaled across token decimals.
  // For demo: use spot price proxy. inputUSD = sizeHuman * inputDecimal.
  // outputAmount = inputUSD * 0.99 / refPriceOfOutput (e.g., $2300/ETH).
  // Production solvers query a real price oracle.
  const inputStart = sizeWei;
  const SPOT_USD_PER_ETH = 2300n; // refresh per demo run (or read from chain)
  const decimalDiff = inputToken.decimals - outputToken.decimals;
  let outputStart: bigint;
  let outputEnd: bigint;
  if (inputToken.address === ADDRESSES.usdc && outputToken.address === ADDRESSES.weth) {
    // USDC (6 dec, $1) → WETH (18 dec, $SPOT). 100 USDC → 0.0428 WETH at $2300.
    outputStart = (sizeWei * 99n * 10n ** 18n) / (100n * SPOT_USD_PER_ETH * 10n ** 6n);
    outputEnd = (outputStart * 98n) / 99n;
  } else if (inputToken.address === ADDRESSES.weth && outputToken.address === ADDRESSES.usdc) {
    // WETH → USDC. 1 WETH → 2277 USDC (99%).
    outputStart = (sizeWei * 99n * SPOT_USD_PER_ETH * 10n ** 6n) / (100n * 10n ** 18n);
    outputEnd = (outputStart * 98n) / 99n;
  } else {
    // Same-decimal pair (e.g., ETH/WETH 18-18) — use proportional scaling.
    void decimalDiff;
    outputStart = (sizeWei * 99n) / 100n;
    outputEnd = (sizeWei * 98n) / 100n;
  }

  // Permit2 nonce: timestamp ms + monotonic suffix to avoid collisions across
  // parallel runs of this script.
  const nonce = bn(BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)));

  // CosignerData — the values the cosigner ratifies. We're self-cosigning
  // (cosigner = swapper) so we just echo the start amounts as no-op overrides.
  const cosignerData = {
    decayStartTime: decayStart,
    decayEndTime: decayEnd,
    exclusiveFiller: '0x0000000000000000000000000000000000000000' as Address,
    exclusivityOverrideBps: bn(0),
    inputOverride: bn(inputStart),
    outputOverrides: [bn(outputStart)],
  };

  // Helper to build an UnsignedV2DutchOrder. Pass Permit2 address explicitly —
  // uniswapx-sdk ships per-chain config but doesn't know about anvil chain id
  // 31337 (its config map is for mainnet/L2s).
  const buildOrder = (cosignatureHex: Hex) =>
    new V2DutchOrderBuilder(args.chainId, ADDRESSES.reactor, ADDRESSES.permit2)
      .swapper(swapper.address)
      .deadline(deadline)
      .nonce(nonce)
      .input({
        token: inputToken.address,
        startAmount: bn(inputStart),
        endAmount: bn(inputStart),
      })
      .output({
        token: outputToken.address,
        startAmount: bn(outputStart),
        endAmount: bn(outputEnd),
        recipient: swapper.address,
      })
      // Self-cosign — see file header. Reactor._validateOrder requires a valid
      // cosignature unconditionally. cosigner=0x0+sig=0x revertswith empty
      // data via abi.decode panic before any custom error fires.
      .cosigner(swapper.address)
      .cosignature(cosignatureHex)
      .decayStartTime(cosignerData.decayStartTime)
      .decayEndTime(cosignerData.decayEndTime)
      .exclusiveFiller(cosignerData.exclusiveFiller)
      .exclusivityOverrideBps(cosignerData.exclusivityOverrideBps)
      // Cosigner overrides MUST equal start amounts (or be more swapper-favourable).
      // Builder validates: inputOverride <= input.startAmount, outputOverride >= output.startAmount.
      // Echoing start amounts is the canonical no-op pattern.
      .inputOverride(cosignerData.inputOverride)
      .outputOverrides(cosignerData.outputOverrides)
      .build();

  // Step 1: build with placeholder cosignature to get a stable orderHash.
  // The orderHash depends on cosigner address (which is set) but NOT on
  // cosignature itself, so this hash is final.
  const placeholder = buildOrder('0x' as Hex);
  const orderHash = placeholder.hash() as Hex;

  console.log('--- order constructed ---');
  console.log('hash         :', orderHash);
  console.log('decayStart   :', new Date(decayStart * 1000).toISOString());
  console.log('decayEnd     :', new Date(decayEnd * 1000).toISOString());
  console.log('deadline     :', new Date(deadline * 1000).toISOString());
  console.log('nonce        :', nonce.toString());
  console.log();

  // Step 2: compute cosigner digest = keccak256(abi.encodePacked(orderHash, abi.encode(cosignerData)))
  // Reactor._validateOrder uses ecrecover RAW — no Ethereum signed message prefix.
  const cosignerDigest = placeholder.cosignatureHash(cosignerData) as Hex;
  const cosignerSig = await swapper.sign({ hash: cosignerDigest });

  // Round-trip: recover should equal swapper (since we self-cosigned).
  const recoveredCosigner = await recoverAddress({ hash: cosignerDigest, signature: cosignerSig });
  if (recoveredCosigner.toLowerCase() !== swapper.address.toLowerCase()) {
    throw new Error(`cosignature does not recover to swapper. got=${recoveredCosigner}`);
  }
  console.log('--- cosigner sig (self-cosign) ---');
  console.log('cosig digest :', cosignerDigest);
  console.log('cosig sig    :', cosignerSig);
  console.log('cosig signer :', recoveredCosigner, '✓ matches swapper');
  console.log();

  // Step 3: rebuild with real cosignature.
  const unsigned = buildOrder(cosignerSig);

  // === Sign via Permit2 EIP-712 ==========================================

  const permit = unsigned.permitData();

  // The SDK returns ethers-shaped typed data. Adapt to viem (BigNumber → bigint).
  const sig = await walletClient.signTypedData({
    account: swapper,
    domain: permit.domain as {
      name?: string;
      version?: string;
      chainId?: number;
      verifyingContract?: Address;
    },
    types: permit.types as Record<string, { name: string; type: string }[]>,
    primaryType: 'PermitWitnessTransferFrom',
    message: normalizeTypedDataValues(permit.values) as Record<string, unknown>,
  });

  console.log('--- signature ---');
  console.log('sig          :', sig);

  // Round-trip proof: recover the signer from the signature.
  const recovered = await recoverTypedDataAddress({
    domain: permit.domain as Parameters<typeof recoverTypedDataAddress>[0]['domain'],
    types: permit.types as Parameters<typeof recoverTypedDataAddress>[0]['types'],
    primaryType: 'PermitWitnessTransferFrom',
    message: normalizeTypedDataValues(permit.values) as Record<string, unknown>,
    signature: sig,
  });
  if (recovered.toLowerCase() !== swapper.address.toLowerCase()) {
    throw new Error(`signature does not recover to swapper. got=${recovered} expected=${swapper.address}`);
  }
  console.log('recovered    :', recovered, '✓ matches swapper');
  console.log();

  // === Encode SignedOrder ================================================

  const orderBytes = unsigned.serialize() as Hex;
  console.log('--- serialized SignedOrder ---');
  console.log('order bytes  :', orderBytes.slice(0, 80) + '... (' + ((orderBytes.length - 2) / 2) + ' bytes)');
  console.log('sig bytes    :', sig);
  console.log();

  // === Optional: ensure swapper has approved Permit2 =====================

  if (inputToken.address !== ADDRESSES.native) {
    const allowance = await publicClient.readContract({
      address: inputToken.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [swapper.address, ADDRESSES.permit2],
    });
    console.log('--- permit2 allowance ---');
    console.log('current      :', allowance.toString());
    if (allowance < sizeWei) {
      console.log('insufficient — approving max…');
      const approveHash = await walletClient.writeContract({
        address: inputToken.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ADDRESSES.permit2, 2n ** 256n - 1n],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log('approved     :', approveHash);
    } else {
      console.log('sufficient   ✓');
    }
    console.log();
  }

  // === Optional submit ==================================================

  if (!args.submit) {
    console.log('--- skipping submit (pass --submit to broadcast) ---');
    console.log();
    console.log('To submit manually:');
    console.log('  cast send', ADDRESSES.filler, '"execute((bytes,bytes),bytes)"', `'(${orderBytes},${sig})'`, '<callbackData>', '\\');
    console.log('    --rpc-url', args.rpcUrl, '--private-key', '$SWAPPER_PRIVATE_KEY');
    console.log();
    console.log('callbackData = abi.encode(FillParams[]) — see Sprint 03 P05 tickCalibration for real values.');
    return;
  }

  console.log('--- submitting Filler.execute ---');
  console.log('Reactor      :', ADDRESSES.reactor);
  console.log('Filler       :', ADDRESSES.filler);

  // FillParams[] — Plan 06 path: env override `FILLPARAMS_CALLBACK_DATA`
  // lets the e2e-fork.ts orchestrator pass a real FillParams encoded array
  // (computed against a v4 pool initialized by the orchestrator). When unset,
  // we ship an empty array to keep Plan 04's behavior (proves the signing
  // path; reverts at FillParamsLengthMismatch, expected, documented).
  const envCallbackData = process.env['FILLPARAMS_CALLBACK_DATA'];
  let callbackData: Hex;
  if (envCallbackData !== undefined && envCallbackData.length > 2) {
    if (!isHex(envCallbackData)) {
      throw new Error('FILLPARAMS_CALLBACK_DATA must be 0x-prefixed hex');
    }
    callbackData = envCallbackData;
    console.log('FillParams source: env (real, length=' + ((envCallbackData.length - 2) / 2) + ' bytes)');
  } else {
    callbackData = encodeAbiParameters(
      [{
        name: 'params',
        type: 'tuple[]',
        components: [
          { name: 'poolKey', type: 'tuple', components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ]},
          { name: 'inputCurrency', type: 'address' },
          { name: 'outputCurrency', type: 'address' },
          { name: 'inputAmount', type: 'uint256' },
          { name: 'outputAmount', type: 'uint256' },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'tickLower', type: 'int24' },
          { name: 'tickUpper', type: 'int24' },
          { name: 'liquidityDelta', type: 'uint128' },
          { name: 'feesCaptured', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      }],
      [[]],
    );
    console.log('FillParams source: placeholder (empty — Plan 06 not wired)');
  }

  // Simulate first to get a decoded revert reason (writeContract just says
  // "execution reverted" without details). simulateContract throws with the
  // typed error data when the call would revert.
  try {
    const sim = await publicClient.simulateContract({
      account: swapper,
      address: ADDRESSES.filler,
      abi: FILLER_EXECUTE_ABI,
      functionName: 'execute',
      args: [{ order: orderBytes, sig }, callbackData],
      ...(inputToken.address === ADDRESSES.native ? { value: sizeWei } : {}),
    });
    console.log('simulation OK; submitting…');
    void sim;
  } catch (err) {
    const errStr = err instanceof Error ? err.message : String(err);
    console.log('simulation revert detail:');
    console.log(errStr.split('\n').slice(0, 12).map((l) => '  ' + l).join('\n'));
    // Continue to real submit anyway — operator wants a tx hash even on failure.
  }

  try {
    const txHash = await walletClient.writeContract({
      address: ADDRESSES.filler,
      abi: FILLER_EXECUTE_ABI,
      functionName: 'execute',
      args: [{ order: orderBytes, sig }, callbackData],
      // Manual gas — bypass eth_estimateGas (which reverts before tx-commit
      // when the call would fail, giving us no tx hash to trace).
      gas: 3_000_000n,
      // No msg.value unless input is native ETH
      ...(inputToken.address === ADDRESSES.native ? { value: sizeWei } : {}),
    });
    console.log('tx submitted :', txHash);
    const rcpt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('block        :', rcpt.blockNumber);
    console.log('status       :', rcpt.status);
    if (rcpt.status === 'success') {
      console.log('✓ Filler.execute succeeded — fork has captured the spread');
    } else {
      console.log('✗ tx reverted on chain — see explorer for trace');
    }
  } catch (err) {
    console.log('✗ submit failed:', err instanceof Error ? err.message : String(err));
    console.log();
    console.log('Common causes (in observed-frequency order):');
    console.log('  - FillParams.validate() reverted (placeholder array doesn\'t match real pool state).');
    console.log('    For Plan 04 acceptance, this is expected — real FillParams come from');
    console.log('    Sprint 03 P05 tickCalibration. We just need a valid tx hash here.');
    console.log('  - Order decayStart still in future (wait ~6s after running this script).');
    console.log('  - Swapper has no input token balance — use anvil_setStorageAt to fund.');
    console.log('  - Permit2 allowance for the input token is 0 (script auto-approves; check log).');
    console.log('  - Cosignature digest mismatch — should be impossible with self-cosign +');
    console.log('    round-trip recover above, but if it ever happens, check that');
    console.log('    cosignerData mirrors the values passed to the builder exactly.');
  }
}

/**
 * The uniswapx-sdk's `permitData()` returns values shaped for ethers (BigNumber).
 * viem expects bigint. Walk the structure recursively + convert.
 */
function normalizeTypedDataValues(values: unknown): unknown {
  if (values === null || values === undefined) return values;
  if (Array.isArray(values)) return values.map(normalizeTypedDataValues);
  if (typeof values === 'object') {
    const obj = values as Record<string, unknown>;
    // ethers BigNumber has `.toBigInt()` or `.toString()` + a `_isBigNumber` brand.
    if ((obj as { _isBigNumber?: boolean })._isBigNumber === true) {
      return BigInt((obj as { toString: () => string }).toString());
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = normalizeTypedDataValues(v);
    }
    return out;
  }
  return values;
}

main().catch((err) => {
  console.error('✗', err instanceof Error ? err.stack : err);
  process.exit(1);
});

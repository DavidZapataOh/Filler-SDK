/**
 * Fixture builders for tests. Each `mock*` function returns a SHAPE-COMPLIANT
 * value matching the canonical SDK types from `src/types.ts` — every bigint
 * field is bigint, every address field is `0x`-prefixed, every required
 * sub-field is populated. Pass `overrides` to vary individual fields.
 *
 * **Type safety**: the return types are literal SDK types (Intent, FillParams,
 * etc.) so a `tsc --noEmit` over your test file fails immediately if the
 * fixture goes stale relative to the real type.
 */

import type {
  ChainStatus,
  DepthHint,
  FillParams,
  FillResult,
  Intent,
  PoolInfo,
  PoolKey,
  ResolvedOutput,
  TokenAmount,
} from '../types';

// === Address pool — easy-to-read, distinct addresses ======================

const ADDRESSES = {
  REACTOR: '0x1111111111111111111111111111111111111111' as const,
  SWAPPER: '0x2222222222222222222222222222222222222222' as const,
  TOKEN_A: '0xa0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0' as const,
  TOKEN_B: '0xb0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0' as const,
  HOOKLESS: '0x0000000000000000000000000000000000000000' as const,
  POOL_ID: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const,
  ORDER_HASH: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const,
  TX_HASH: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
} as const;

/** sqrt(1) << 96 — neutral price for fixtures. */
const SQRT_PRICE_X96_AT_TICK_0 = 79_228_162_514_264_337_593_543_950_336n;

/** Intent deadline default: 10 minutes from now. */
function defaultDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 600);
}

// === TokenAmount + ResolvedOutput ========================================

export function mockTokenAmount(overrides: Partial<TokenAmount> = {}): TokenAmount {
  return {
    token: ADDRESSES.TOKEN_A,
    amount: 1_000_000_000n,
    ...overrides,
  };
}

export function mockResolvedOutput(
  overrides: Partial<ResolvedOutput> = {},
): ResolvedOutput {
  return {
    token: ADDRESSES.TOKEN_B,
    amount: 500_000_000n,
    recipient: ADDRESSES.SWAPPER,
    ...overrides,
  };
}

// === Intent =============================================================

export function mockIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    reactor: ADDRESSES.REACTOR,
    swapper: ADDRESSES.SWAPPER,
    nonce: 1n,
    deadline: defaultDeadline(),
    additionalValidationContract: ADDRESSES.HOOKLESS,
    additionalValidationData: '0x',
    input: mockTokenAmount(),
    outputs: [mockResolvedOutput()],
    chainId: 130,
    observedAt: 100n,
    txHash: ADDRESSES.TX_HASH,
    orderHash: ADDRESSES.ORDER_HASH,
    rawOrder: '0xdeadbeef',
    signature: '0xcafebabe',
    ...overrides,
  };
}

// === PoolKey + PoolInfo =================================================

export function mockPoolKey(overrides: Partial<PoolKey> = {}): PoolKey {
  return {
    currency0: ADDRESSES.TOKEN_A,
    currency1: ADDRESSES.TOKEN_B,
    fee: 3000,
    tickSpacing: 60,
    hooks: ADDRESSES.HOOKLESS,
    ...overrides,
  };
}

export function mockPoolInfo(overrides: Partial<PoolInfo> = {}): PoolInfo {
  return {
    id: ADDRESSES.POOL_ID,
    currency0: ADDRESSES.TOKEN_A,
    currency1: ADDRESSES.TOKEN_B,
    fee: 3000,
    tickSpacing: 60,
    hooks: ADDRESSES.HOOKLESS,
    sqrtPriceX96: SQRT_PRICE_X96_AT_TICK_0,
    liquidity: 1_000_000_000_000n,
    tick: 0,
    ...overrides,
  };
}

// === FillParams =========================================================

export function mockFillParams(overrides: Partial<FillParams> = {}): FillParams {
  return {
    poolKey: mockPoolKey(),
    inputCurrency: ADDRESSES.TOKEN_A,
    outputCurrency: ADDRESSES.TOKEN_B,
    inputAmount: 1_000_000_000n,
    outputAmount: 500_000_000n,
    zeroForOne: true,
    tickLower: -120,
    tickUpper: 120,
    liquidityDelta: 1_000_000_000_000n,
    feesCaptured: 1_000_000n,
    deadline: defaultDeadline(),
    ...overrides,
  };
}

// === FillResult =========================================================

export function mockFillResult(overrides: Partial<FillResult> = {}): FillResult {
  const intent = overrides.intent ?? mockIntent();
  const params = overrides.params ?? mockFillParams();
  return {
    txHash: ADDRESSES.TX_HASH,
    blockNumber: 21_000_000n,
    effectiveGasPriceWei: 2_000_000_000n,
    gasUsed: 500_000n,
    feeCapturedAmount: 1_000_000n,
    intent,
    params,
    ...overrides,
  };
}

// === DepthHint ==========================================================

export function mockDepthHint(overrides: Partial<DepthHint> = {}): DepthHint {
  return {
    pool: ADDRESSES.POOL_ID,
    hint: {
      tickLower: -120,
      tickUpper: 120,
      liquidityDelta: 1_000_000_000_000n,
      expectedFeeCapture: 1_000_000n,
      expectedSlippageBps: 5,
      expectedGasOverhead: 500_000_000_000_000n,
      estimatedNetProfit: 800_000n,
      ...overrides.hint,
    },
    poolState: {
      currentTick: 0,
      currentSqrtPrice: SQRT_PRICE_X96_AT_TICK_0,
      ...overrides.poolState,
    },
    ...(({ hint: _hint, poolState: _poolState, ...rest }) => rest)(overrides),
  };
}

// === ChainStatus ========================================================

export function mockChainStatus(overrides: Partial<ChainStatus> = {}): ChainStatus {
  return {
    chainId: 130,
    latestBlock: 21_000_000n,
    lastUpdatedAt: BigInt(Math.floor(Date.now() / 1000)),
    ...overrides,
  };
}

// === Address pool re-export (handy for one-off addresses) ===============

export const TEST_ADDRESSES = ADDRESSES;

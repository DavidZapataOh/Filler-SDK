import type { DepthHint, FillParams, Intent, PoolInfo } from '../../src';

const TOKEN_A = '0x1111111111111111111111111111111111111111' as const;
const TOKEN_B = '0x2222222222222222222222222222222222222222' as const;
const REACTOR = '0x3333333333333333333333333333333333333333' as const;
const SWAPPER = '0x4444444444444444444444444444444444444444' as const;
const HOOKS = '0x0000000000000000000000000000000000000000' as const;
const POOL_ID =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

export const TEST_ADDRESSES = {
  TOKEN_A,
  TOKEN_B,
  REACTOR,
  SWAPPER,
  HOOKS,
  FILLER: '0x5555555555555555555555555555555555555555' as `0x${string}`,
  POOL_MANAGER: '0x6666666666666666666666666666666666666666' as `0x${string}`,
  POOL_ID,
};

export function makeIntent(overrides: Partial<Intent> = {}): Intent {
  const inFuture = BigInt(Math.floor(Date.now() / 1000) + 60_000);
  return {
    reactor: REACTOR,
    swapper: SWAPPER,
    nonce: 1n,
    deadline: inFuture,
    additionalValidationContract: '0x0000000000000000000000000000000000000000',
    additionalValidationData: '0x',
    input: { token: TOKEN_A, amount: 1_000_000_000n },
    outputs: [{ token: TOKEN_B, amount: 500_000_000n, recipient: SWAPPER }],
    chainId: 130,
    observedAt: 100n,
    txHash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    orderHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rawOrder: '0xdeadbeef',
    signature: '0xcafebabe',
    ...overrides,
  };
}

export function makePoolInfo(overrides: Partial<PoolInfo> = {}): PoolInfo {
  return {
    id: POOL_ID,
    currency0: TOKEN_A,
    currency1: TOKEN_B,
    fee: 3000,
    tickSpacing: 60,
    hooks: HOOKS,
    sqrtPriceX96: 79_228_162_514_264_337_593_543_950_336n, // sqrt(1) << 96
    liquidity: 1_000_000_000_000n,
    tick: 0,
    ...overrides,
  };
}

export function makeDepthHint(overrides: Partial<DepthHint['hint']> = {}): DepthHint {
  return {
    pool: POOL_ID,
    hint: {
      tickLower: -120,
      tickUpper: 120,
      liquidityDelta: 1_000_000_000_000n,
      expectedFeeCapture: 1_000_000n,
      ...overrides,
    },
  };
}

export function makeFillParams(overrides: Partial<FillParams> = {}): FillParams {
  return {
    poolKey: {
      currency0: TOKEN_A,
      currency1: TOKEN_B,
      fee: 3000,
      tickSpacing: 60,
      hooks: HOOKS,
    },
    inputCurrency: TOKEN_A,
    outputCurrency: TOKEN_B,
    inputAmount: 1_000_000_000n,
    outputAmount: 500_000_000n,
    zeroForOne: true,
    tickLower: -120,
    tickUpper: 120,
    liquidityDelta: 1_000_000_000_000n,
    feesCaptured: 1_000_000n,
    deadline: 9_999_999_999n,
    ...overrides,
  };
}

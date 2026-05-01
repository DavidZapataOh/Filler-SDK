import type { Intent } from '../../src';

const REACTOR = '0x1111111111111111111111111111111111111111' as const;
const SWAPPER = '0x2222222222222222222222222222222222222222' as const;
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as const;

export function makeIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    reactor: REACTOR,
    swapper: SWAPPER,
    nonce: 1n,
    deadline: 9_999_999_999n,
    additionalValidationContract: '0x0000000000000000000000000000000000000000',
    additionalValidationData: '0x',
    input: { token: USDC, amount: 1_000_000_000_000n },
    outputs: [
      {
        token: WETH,
        amount: 500_000_000_000_000_000n,
        recipient: SWAPPER,
      },
    ],
    chainId: 130,
    observedAt: 100n,
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    orderHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rawOrder: '0xdeadbeef',
    signature: '0xcafebabe',
    ...overrides,
  };
}

export const TOKENS = { USDC, WETH };
export const REACTOR_ADDR = REACTOR;

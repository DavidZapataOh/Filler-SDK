import { describe, expect, test } from 'vitest';

import { v4PoolManagerAbi } from '../abis/v4PoolManager';

describe('v4PoolManagerAbi', () => {
  test('contains the four core JIT-relevant events', () => {
    const eventNames = v4PoolManagerAbi
      .filter((item) => item.type === 'event')
      .map((item) => ('name' in item ? item.name : ''));

    expect(eventNames).toContain('Initialize');
    expect(eventNames).toContain('ModifyLiquidity');
    expect(eventNames).toContain('Swap');
    expect(eventNames).toContain('Donate');
  });

  test('Initialize event has the expected indexed-param shape', () => {
    const init = v4PoolManagerAbi.find(
      (item) => item.type === 'event' && 'name' in item && item.name === 'Initialize',
    );
    expect(init).toBeDefined();
    expect(init?.type).toBe('event');

    if (!init || init.type !== 'event' || !('inputs' in init)) {
      throw new Error('Initialize event missing inputs');
    }
    const inputs = init.inputs as Array<{ name: string; type: string; indexed?: boolean }>;
    const byName = new Map(inputs.map((i) => [i.name, i]));

    // Indexed lookup keys for poolId-based queries.
    expect(byName.get('id')?.indexed).toBe(true);
    expect(byName.get('currency0')?.indexed).toBe(true);
    expect(byName.get('currency1')?.indexed).toBe(true);

    // Non-indexed payload fields.
    expect(byName.get('fee')?.type).toBe('uint24');
    expect(byName.get('tickSpacing')?.type).toBe('int24');
    expect(byName.get('hooks')?.type).toBe('address');
    expect(byName.get('sqrtPriceX96')?.type).toBe('uint160');
    expect(byName.get('tick')?.type).toBe('int24');
  });

  test('ModifyLiquidity event has the position-keying inputs', () => {
    const ml = v4PoolManagerAbi.find(
      (item) =>
        item.type === 'event' && 'name' in item && item.name === 'ModifyLiquidity',
    );
    if (!ml || ml.type !== 'event' || !('inputs' in ml)) {
      throw new Error('ModifyLiquidity event missing inputs');
    }
    const inputs = ml.inputs as Array<{ name: string; type: string; indexed?: boolean }>;
    const byName = new Map(inputs.map((i) => [i.name, i]));

    expect(byName.get('id')?.indexed).toBe(true);
    expect(byName.get('sender')?.indexed).toBe(true);
    expect(byName.get('tickLower')?.type).toBe('int24');
    expect(byName.get('tickUpper')?.type).toBe('int24');
    expect(byName.get('liquidityDelta')?.type).toBe('int256');
    expect(byName.get('salt')?.type).toBe('bytes32');
  });

  test('Swap event exposes pool state post-swap', () => {
    const sw = v4PoolManagerAbi.find(
      (item) => item.type === 'event' && 'name' in item && item.name === 'Swap',
    );
    if (!sw || sw.type !== 'event' || !('inputs' in sw)) {
      throw new Error('Swap event missing inputs');
    }
    const inputs = sw.inputs as Array<{ name: string; type: string }>;
    const byName = new Map(inputs.map((i) => [i.name, i]));

    expect(byName.get('amount0')?.type).toBe('int128');
    expect(byName.get('amount1')?.type).toBe('int128');
    expect(byName.get('sqrtPriceX96')?.type).toBe('uint160');
    expect(byName.get('liquidity')?.type).toBe('uint128');
    expect(byName.get('tick')?.type).toBe('int24');
    expect(byName.get('fee')?.type).toBe('uint24');
  });
});

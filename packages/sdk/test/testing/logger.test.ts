import { describe, expect, test } from 'vitest';

import { createTestLogger } from '../../src/testing';

describe('testing/logger — createTestLogger', () => {
  test('captures every level into calls buffer', () => {
    const log = createTestLogger();
    log.trace('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(log.calls.length).toBe(5);
    expect(log.calls.map((c) => c.level)).toEqual([
      'trace',
      'debug',
      'info',
      'warn',
      'error',
    ]);
  });

  test('captures (ctx, msg) form', () => {
    const log = createTestLogger();
    log.info({ key: 'val' }, 'message');
    expect(log.calls[0]).toEqual({
      level: 'info',
      msg: 'message',
      ctx: { key: 'val' },
    });
  });

  test('callsAt filters by level', () => {
    const log = createTestLogger();
    log.info('1');
    log.warn('2');
    log.warn('3');
    log.error('4');
    expect(log.callsAt('warn').length).toBe(2);
    expect(log.callsAt('error').length).toBe(1);
  });

  test('reset clears the buffer', () => {
    const log = createTestLogger();
    log.info('1');
    log.reset();
    expect(log.calls.length).toBe(0);
  });

  test('child logger merges bindings into ctx', () => {
    const log = createTestLogger();
    const child = log.child?.({ component: 'test' });
    expect(child).toBeDefined();
    if (child === undefined) throw new Error('unreachable');
    child.info({ orderHash: '0xff' }, 'fired');
    expect(log.calls[0]?.ctx).toEqual({
      component: 'test',
      orderHash: '0xff',
    });
  });

  test('child logger inherits writes into parent buffer', () => {
    const log = createTestLogger();
    const child = log.child?.({ component: 'a' });
    child?.info('via-child');
    log.info('via-parent');
    expect(log.calls.length).toBe(2);
  });
});

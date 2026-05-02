import { describe, expect, test } from 'vitest';

import {
  UnknownTemplateVariableError,
  render,
} from '../src/render';

describe('render — {{var}} substitution', () => {
  test('replaces a single var', () => {
    expect(render('hello {{name}}!', { name: 'world' })).toBe('hello world!');
  });

  test('replaces multiple vars', () => {
    expect(
      render('{{a}} + {{b}} = {{c}}', { a: 1, b: 2, c: 3 }),
    ).toBe('1 + 2 = 3');
  });

  test('replaces booleans by string-coerce', () => {
    expect(render('flag={{x}}', { x: true })).toBe('flag=true');
    expect(render('flag={{x}}', { x: false })).toBe('flag=false');
  });

  test('leaves unknown vars as-is when not strict', () => {
    expect(render('hello {{nope}}', {})).toBe('hello {{nope}}');
  });

  test('throws on unknown vars in strict mode', () => {
    expect(() => render('hello {{nope}}', {}, { strict: true })).toThrow(
      UnknownTemplateVariableError,
    );
  });

  test('does not interpret prototype keys', () => {
    // Object.hasOwn fences out things like __proto__ / toString.
    expect(render('{{toString}}', {})).toBe('{{toString}}');
    expect(render('{{__proto__}}', {})).toBe('{{__proto__}}');
  });

  test('handles same var appearing multiple times', () => {
    expect(render('{{x}} and {{x}} and {{x}}', { x: 'foo' })).toBe(
      'foo and foo and foo',
    );
  });

  test('preserves whitespace + newlines', () => {
    expect(render('{{a}}\n  {{b}}\n', { a: '1', b: '2' })).toBe('1\n  2\n');
  });
});

describe('render — {{#if X}}...{{/if}} blocks', () => {
  test('includes body when var is true', () => {
    expect(render('a{{#if x}}b{{/if}}c', { x: true })).toBe('abc');
  });

  test('strips body when var is false', () => {
    expect(render('a{{#if x}}b{{/if}}c', { x: false })).toBe('ac');
  });

  test('strips body when var is missing', () => {
    expect(render('a{{#if x}}b{{/if}}c', {})).toBe('ac');
  });

  test('non-empty string is truthy', () => {
    expect(render('{{#if x}}YES{{/if}}', { x: 'anything' })).toBe('YES');
  });

  test('empty string is falsy', () => {
    expect(render('{{#if x}}YES{{/if}}', { x: '' })).toBe('');
  });

  test('zero is falsy', () => {
    expect(render('{{#if x}}YES{{/if}}', { x: 0 })).toBe('');
  });

  test('positive number is truthy', () => {
    expect(render('{{#if x}}YES{{/if}}', { x: 42 })).toBe('YES');
  });

  test('preserves multiline content inside the block', () => {
    const t = `before
{{#if flag}}
included line 1
included line 2
{{/if}}
after`;
    expect(render(t, { flag: true })).toBe(`before

included line 1
included line 2

after`);
  });

  test('multiple ifs — each evaluated independently', () => {
    const t = '{{#if a}}A{{/if}}{{#if b}}B{{/if}}{{#if c}}C{{/if}}';
    expect(render(t, { a: true, b: false, c: true })).toBe('AC');
  });
});

describe('render — combined directives', () => {
  test('substitutes inside an if-block when truthy', () => {
    expect(
      render('{{#if x}}hello {{name}}{{/if}}', { x: true, name: 'world' }),
    ).toBe('hello world');
  });

  test('does not substitute inside an if-block that strips', () => {
    // The block is removed wholesale; vars inside aren't touched.
    expect(
      render('{{#if x}}hello {{name}}{{/if}}', { x: false, name: 'world' }),
    ).toBe('');
  });

  test('does not substitute outside if-block (env-example pattern)', () => {
    const t = `RPC_URL={{rpcUrl}}\n{{#if useKeeperHub}}KEEPERHUB_KEY=\n{{/if}}`;
    const r = render(t, { rpcUrl: 'http://x', useKeeperHub: true });
    expect(r).toBe('RPC_URL=http://x\nKEEPERHUB_KEY=\n');
  });
});

describe('render — security', () => {
  test('does not eval user-controlled value', () => {
    const malicious = "'); throw new Error('pwned'); ('";
    expect(render('{{x}}', { x: malicious })).toBe(malicious);
  });

  test('regex-special chars in value pass through verbatim', () => {
    expect(render('{{x}}', { x: '$&\\1' })).toBe('$&\\1');
  });

  test('does not infinitely loop on adversarial templates', () => {
    // Pathological: an {{#if}} block whose body contains another {{#if}} for
    // a key that's truthy + uses the same wrapper. The safety counter (8
    // passes) bounds the loop.
    const t = '{{#if a}}{{#if a}}YES{{/if}}{{/if}}';
    expect(render(t, { a: true })).toBe('YES');
  });
});

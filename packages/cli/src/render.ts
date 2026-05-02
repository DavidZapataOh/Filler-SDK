/**
 * Tiny template engine for `create-filler`. Two directives — that's it:
 *
 *   1. `{{var}}`         — simple value substitution. Unknown variables are
 *                          left as-is (so a typo surfaces in the output
 *                          instead of silently disappearing).
 *   2. `{{#if X}}…{{/if}}` — conditional block. Truthy boolean OR non-empty
 *                          string includes the body; everything else strips
 *                          it. Whitespace handling is "preserve as-authored"
 *                          — caller controls trailing newlines.
 *
 * Intentionally NOT supported: `{{#each}}`, partials, helpers, `{{else}}`.
 * If a future template needs richer logic, the right move is to compute the
 * branch in TypeScript + pass it as a string variable. Keeping the engine
 * tiny keeps the security review trivial (no eval, no dynamic field access,
 * pure regex over user-controlled strings of which the user IS the SDK
 * author — adversaries don't author templates here).
 *
 * **Whitespace caveat (intentional)**: `{{#if}}…{{/if}}` blocks preserve
 * surrounding whitespace exactly. Authors who want a trailing newline write
 * `{{#if X}}…\n{{/if}}` or use `\n{{#if X}}…\n{{/if}}` for paragraph blocks.
 * Smarter "trim leading/trailing newlines around the directive" handling
 * would simplify some templates; we don't ship it because it complicates the
 * mental model + makes diffs less predictable.
 */

export type TemplateValue = string | boolean | number;

export interface RenderOptions {
  /**
   * When true, an unknown `{{var}}` throws instead of being left in the
   * output. Used by tests to catch typos; production calls leave as-is so a
   * partially-authored template still renders cleanly during development.
   */
  strict?: boolean;
}

export class UnknownTemplateVariableError extends Error {
  override readonly name = 'UnknownTemplateVariableError';
  constructor(name: string) {
    super(`unknown template variable: ${name}`);
  }
}

const IF_BLOCK = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
const VAR = /\{\{(\w+)\}\}/g;

export function render(
  template: string,
  vars: Record<string, TemplateValue>,
  opts: RenderOptions = {},
): string {
  // Stage 1: process {{#if X}}...{{/if}} blocks. Iterate until no more
  // matches so nested ifs work (we don't promise nesting in docs but it
  // shouldn't crash if it shows up).
  let out = template;
  let safety = 8;
  while (safety-- > 0 && IF_BLOCK.test(out)) {
    IF_BLOCK.lastIndex = 0; // reset regex state for the next pass
    out = out.replace(IF_BLOCK, (_match, key: string, body: string) => {
      const val = vars[key];
      const truthy =
        val === true ||
        (typeof val === 'string' && val.length > 0) ||
        (typeof val === 'number' && val !== 0);
      return truthy ? body : '';
    });
  }

  // Stage 2: simple {{var}} substitution.
  out = out.replace(VAR, (match, key: string) => {
    if (!Object.hasOwn(vars, key)) {
      if (opts.strict === true) {
        throw new UnknownTemplateVariableError(key);
      }
      return match;
    }
    const v = vars[key];
    if (v === undefined) return match;
    return String(v);
  });

  return out;
}

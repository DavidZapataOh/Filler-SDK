/**
 * HeroCounter — Plan 01 ships a static visual; Plan 03 wires SSE.
 *
 * What we lock down here:
 *   - The Big Number IS the captured amount, formatted en-US with 2 decimals.
 *   - The Big Number gets the pure-white text token (the only element on
 *     the page allowed to use it). Detected via the inline class — if a
 *     future refactor demotes it to a muted gray, this test fails and
 *     forces the design discussion.
 *   - Tabular nums applied so digits don't jiggle on increments.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { HeroCounter } from '../src/components/HeroCounter';

describe('HeroCounter', () => {
  test('formats the amount as USD with two decimals (en-US)', () => {
    render(<HeroCounter amountUSD={12345.6} />);
    expect(screen.getByTestId('hero-counter-amount')).toHaveTextContent('12,345.60');
  });

  test('handles zero gracefully (Plan 01 boots with 0)', () => {
    render(<HeroCounter amountUSD={0} />);
    expect(screen.getByTestId('hero-counter-amount')).toHaveTextContent('0.00');
  });

  test('Big Number uses the design system primary text token (pure white reservation)', () => {
    render(<HeroCounter amountUSD={42} />);
    const el = screen.getByTestId('hero-counter-amount');
    // The pure-white primary token. If anyone tones this down, the test
    // fails — forcing an explicit design call.
    expect(el.className).toMatch(/text-\[--color-text-primary\]/);
    // tabular-nums must remain — non-tabular digits are jittery on rolling
    // counters. JetBrains Mono ships them by default; we belt-and-suspenders.
    expect(el.className).toMatch(/tabular-nums/);
  });

  test('headline copy reads "Spread captured" (the demo narrative)', () => {
    render(<HeroCounter amountUSD={0} />);
    expect(screen.getByText(/Spread captured/i)).toBeInTheDocument();
  });

  test('exposes a screen-reader label with the amount + currency', () => {
    render(<HeroCounter amountUSD={1234.5} />);
    expect(screen.getByLabelText(/1,234\.50 US dollars captured/i)).toBeInTheDocument();
  });
});

/**
 * CalendarTimelapse — Plan 02 structural tests.
 *
 * Locks down:
 *   - Four W1..W4 badges in order (the "passage of weeks" mental model).
 *   - <ol> semantic element (ordered list of phases) — not a div.
 *   - No money-color leak: the BEFORE side is supposed to be drained
 *     neutrals only. If a future contributor sneaks emerald in to "make
 *     it pop," this test fails.
 *   - No animate-pulse class anywhere — pulse signals "loading state",
 *     wrong mental model for "weeks elapsing." (See FEEDBACK F-44.)
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { CalendarTimelapse } from '../src/components/Hero/CalendarTimelapse';

describe('CalendarTimelapse', () => {
  test('renders W1..W4 badges in order', () => {
    render(<CalendarTimelapse />);
    expect(screen.getByText('W1')).toBeInTheDocument();
    expect(screen.getByText('W2')).toBeInTheDocument();
    expect(screen.getByText('W3')).toBeInTheDocument();
    expect(screen.getByText('W4')).toBeInTheDocument();
  });

  test('uses an ordered-list element for assistive-tech phase semantics', () => {
    render(<CalendarTimelapse />);
    const list = screen.getByRole('list', { name: /Four-week solver bringup checklist/i });
    expect(list.tagName).toBe('OL');
  });

  test('no money-color (emerald) leak — BEFORE side is drained neutrals', () => {
    const { container } = render(<CalendarTimelapse />);
    // Strict: no class on any descendant references the money tokens.
    const html = container.innerHTML;
    expect(html).not.toContain('--color-money');
    // Equivalent guard for Tailwind emerald shorthand if anyone bypasses
    // the design tokens.
    expect(html).not.toMatch(/\bemerald-\d/);
  });

  test('no animate-pulse class (pulse means loading, not "weeks elapsing")', () => {
    const { container } = render(<CalendarTimelapse />);
    expect(container.innerHTML).not.toContain('animate-pulse');
  });
});

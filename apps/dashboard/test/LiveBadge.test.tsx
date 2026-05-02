/**
 * LiveBadge — visual + a11y tests.
 *
 * design.txt enforcement: status carries the only color in the badge.
 * The label uses muted gray; cyan is reserved for "live" specifically.
 * If a future contributor recolors "live" to emerald, this test fails —
 * keeping emerald exclusive to the money counter.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { LiveBadge } from '../src/components/LiveBadge';

describe('LiveBadge', () => {
  test('renders the default label for status=live', () => {
    render(<LiveBadge status="live" />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  test('renders Reconnecting for status=degraded', () => {
    render(<LiveBadge status="degraded" />);
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });

  test('renders Disconnected for status=disconnected', () => {
    render(<LiveBadge status="disconnected" />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  test('overrides the label when `label` prop provided (replay-mode)', () => {
    render(<LiveBadge status="live" label="Replaying" />);
    expect(screen.getByText('Replaying')).toBeInTheDocument();
  });

  test('exposes status as a data attribute for downstream selectors', () => {
    render(<LiveBadge status="degraded" />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('data-status', 'degraded');
  });

  test('uses aria-live polite so SR readers announce changes without interrupting', () => {
    render(<LiveBadge status="live" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});

/**
 * App — smoke test that the page renders + the demo narrative is intact.
 *
 * If a future refactor accidentally removes the hero, the placeholder grid,
 * or the brand tagline, this fires.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { App } from '../src/App';

describe('App', () => {
  test('renders the brand mark + name', () => {
    render(<App />);
    expect(screen.getByText('Filler SDK')).toBeInTheDocument();
  });

  test('renders the hero headline', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /DAO treasuries internalising their own spread/i,
      }),
    ).toBeInTheDocument();
  });

  test('renders the live badge in the header (Plan 06 wires SSE state)', () => {
    render(<App />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'live');
  });

  test('renders all four placeholder slots (Plans 02-05 attach here)', () => {
    render(<App />);
    expect(screen.getByText(/Before \/ after/i)).toBeInTheDocument();
    expect(screen.getByText(/JIT depth/i)).toBeInTheDocument();
    expect(screen.getByText(/Three files/i)).toBeInTheDocument();
    expect(screen.getByText(/Recent fills/i)).toBeInTheDocument();
  });

  test('keeps the "tres archivos y un bond" tagline somewhere on the page', () => {
    render(<App />);
    // The tagline appears in BOTH the header (subtitle) and the footer
    // (canonical placement). At least one is present — both is fine.
    expect(screen.getAllByText(/tres archivos y un bond/i).length).toBeGreaterThan(0);
  });
});

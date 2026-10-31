import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Page from './page';

describe('home page', () => {
  it('renders visible content', () => {
    const { container } = render(<Page />);
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('every link has a destination', () => {
    render(<Page />);
    for (const link of screen.queryAllByRole('link')) {
      expect(link).toHaveAttribute('href');
    }
  });
});

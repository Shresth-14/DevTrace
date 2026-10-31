import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Page from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// Node's built-in localStorage global shadows jsdom's and is undefined without a backing file.
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

afterEach(cleanup);

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

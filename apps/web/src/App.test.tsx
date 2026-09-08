import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import uk from './i18n/uk.json';
import ru from './i18n/ru.json';

const cssText = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

const REQUIRED_KEYS = [
  'catalog',
  'cart',
  'checkout',
  'orders',
  'favorites',
  'admin',
  'search',
  'filters',
  'add',
  'price',
  'out_of_stock',
  'thank_you',
] as const;

describe('App shell smoke', () => {
  it('should render the FreshDoze shell with tab bar', () => {
    render(<App />);
    expect(screen.getByText('FreshDoze')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('should load both uk and ru locales with all core strings', () => {
    for (const key of REQUIRED_KEYS) {
      expect(uk[key as keyof typeof uk], `uk missing: ${key}`).toBeTruthy();
      expect(ru[key as keyof typeof ru], `ru missing: ${key}`).toBeTruthy();
    }
  });

  it('should define turquoise/white theme vars', () => {
    expect(cssText).toContain('--color-surface');
    expect(cssText).toContain('--color-accent');
    expect(cssText).toContain('#ffffff');
    expect(cssText).toContain('#2dd4bf');
  });
});

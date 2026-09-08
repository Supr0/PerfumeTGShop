import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const ROUTE_PRODUCT = {
  id: 1,
  name: 'Aventus',
  brand: 'Creed',
  family: 'citrus',
  variants: [{ id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 }],
};

describe('App hash routing', () => {
  beforeEach(() => {
    window.location.hash = '#/';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes('/v1/admin/me'))
          return { ok: false, status: 403, json: async () => ({ detail: 'forbidden' }) };
        if (url.startsWith('/v1/products/'))
          return { ok: true, status: 200, json: async () => ROUTE_PRODUCT };
        if (url.includes('/v1/catalog'))
          return { ok: true, status: 200, json: async () => ({ items: [ROUTE_PRODUCT], total: 1 }) };
        return { ok: false, status: 404, json: async () => ({ detail: 'not found' }) };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.location.hash = '#/';
  });

  it('should mount the real catalog at #/', async () => {
    render(<App />);
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('should mount the cart page at #/cart', () => {
    window.location.hash = '#/cart';
    render(<App />);
    expect(screen.getByText('Корзина')).toBeInTheDocument();
  });

  it('should mount the orders page at #/orders', () => {
    window.location.hash = '#/orders';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Замовлення' })).toBeInTheDocument();
  });

  it('should mount the favorites page at #/favorites', () => {
    window.location.hash = '#/favorites';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Избранное' })).toBeInTheDocument();
  });

  it('should mount the product detail at #/product/:id', async () => {
    window.location.hash = '#/product/1';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Aventus' })).toBeInTheDocument();
  });

  it('should navigate via the tab bar without losing the admin gating', async () => {
    render(<App />);
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Кошик' }));
    expect(window.location.hash).toBe('#/cart');
    expect(screen.getByText('Корзина')).toBeInTheDocument();
    // Non-admin: the admin tab stays hidden.
    expect(screen.queryByRole('tab', { name: 'Адмін' })).not.toBeInTheDocument();
  });
});

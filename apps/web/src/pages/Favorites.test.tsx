import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Favorites, { loadFavorites, persistFavorites, toggleFavorite } from './Favorites';
import type { Product } from '../components/ProductCard';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

const products: Product[] = [
  {
    id: 1,
    name: 'Aventus',
    brand: 'Creed',
    variants: [
      { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 },
      { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
    ],
  },
  {
    id: 2,
    name: 'Sauvage',
    brand: 'Dior',
    variants: [{ id: 21, volume_ml: 5, price_minor_uah: 49000, old_price_minor_uah: null, stock: 3 }],
  },
];

function catalogResponse(items: Product[] = products) {
  return { ok: true, status: 200, json: async () => ({ items, total: items.length }) };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });
  vi.restoreAllMocks();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

afterEach(() => cleanup());

describe('favorites storage', () => {
  it('should toggle hearts in and out', () => {
    expect(toggleFavorite([], 'p1')).toEqual(['p1']);
    expect(toggleFavorite(['p1', 'p2'], 'p1')).toEqual(['p2']);
  });

  it('should round-trip through localStorage', () => {
    expect(persistFavorites(['p1', 'p2'])).toBe(true);
    expect(loadFavorites()).toEqual(['p1', 'p2']);
  });
});

describe('Favorites page smoke (UK default)', () => {
  it('should render the empty state', () => {
    render(<Favorites fetchImpl={vi.fn().mockReturnValue(new Promise(() => {}))} />);
    expect(screen.getByText('В обраному поки порожньо')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти до каталогу' })).toHaveAttribute('href', '#/');
  });

  it('should resolve hearts to product details with a single catalog fetch', async () => {
    persistFavorites(['1', '2']);
    const fetchImpl = vi.fn().mockResolvedValue(catalogResponse());
    render(<Favorites fetchImpl={fetchImpl} />);
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    expect(screen.getByText('Creed')).toBeInTheDocument();
    expect(screen.getByText('Sauvage')).toBeInTheDocument();
    expect(screen.getByText('Dior')).toBeInTheDocument();
    // from-price: cheapest variant first (390 for Aventus, 490 for Sauvage)
    expect(screen.getByText(/390/)).toBeInTheDocument();
    expect(screen.getByText(/490/)).toBeInTheDocument();
    // heart-filled marker + product links
    expect(screen.getAllByText('♥').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: /Aventus/ })).toHaveAttribute('href', '#/product/1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('should hide missing products without crashing', async () => {
    persistFavorites(['1', '999']);
    render(<Favorites fetchImpl={vi.fn().mockResolvedValue(catalogResponse([products[0]]))} />);
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Aventus/ })).toHaveAttribute('href', '#/product/1');
  });

  it('should show an error with retry on catalog failure', async () => {
    persistFavorites(['1']);
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    render(<Favorites fetchImpl={fetchImpl} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fetchImpl.mockResolvedValue(catalogResponse());
    fireEvent.click(screen.getByRole('button', { name: /спробувати ще/i }));
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
  });

  it('should unheart a product when remove is pressed', async () => {
    persistFavorites(['1']);
    render(<Favorites fetchImpl={vi.fn().mockResolvedValue(catalogResponse())} />);
    const remove = await screen.findByRole('button', { name: 'Прибрати Aventus з обраного' });
    fireEvent.click(remove);
    await waitFor(() => {
      expect(screen.getByText('В обраному поки порожньо')).toBeInTheDocument();
    });
  });

  it('should render RU strings when locale="ru"', async () => {
    persistFavorites(['1']);
    render(
      <Favorites locale="ru" fetchImpl={vi.fn().mockResolvedValue(catalogResponse())} />,
    );
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать Aventus из избранного' })).toBeInTheDocument();
  });

  it('should render the RU empty state', () => {
    render(
      <Favorites locale="ru" fetchImpl={vi.fn().mockReturnValue(new Promise(() => {}))} />,
    );
    expect(screen.getByText('В избранном пока пусто')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти к каталогу' })).toBeInTheDocument();
  });
});

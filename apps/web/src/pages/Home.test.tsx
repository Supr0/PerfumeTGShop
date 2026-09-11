import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Home, buildCatalogQuery } from './Home';
import type { Product } from '../components/ProductCard';
import { DEFAULT_FILTERS } from '../components/FilterSheet';
import { loadCart } from '../lib/cart';

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
    family: 'citrus',
    season: ['spring'],
    variants: [
      { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 },
      { id: 12, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 1 },
      { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
    ],
  },
  {
    id: 2,
    name: 'Sauvage',
    brand: 'Dior',
    family: 'oud',
    season: ['winter'],
    variants: [
      { id: 21, volume_ml: 3, price_minor_uah: 29000, old_price_minor_uah: null, stock: 0 },
      { id: 22, volume_ml: 5, price_minor_uah: 49000, old_price_minor_uah: null, stock: 0 },
      { id: 23, volume_ml: 10, price_minor_uah: 89000, old_price_minor_uah: null, stock: 0 },
    ],
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

describe('Home (wired to the real catalog API)', () => {
  it('should show skeletons while loading', () => {
    const fetchImpl = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<Home fetchImpl={fetchImpl} />);
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('should render the server list after load', async () => {
    render(<Home fetchImpl={vi.fn().mockResolvedValue(catalogResponse())} />);
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    expect(screen.getByText('Sauvage')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /фільтри|фильтры|filters/i })).toBeInTheDocument();
  });

  it('should show an empty state with reset when the server returns nothing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(catalogResponse([]));
    render(<Home fetchImpl={fetchImpl} />);
    expect(await screen.findByText(/нічого не знайдено/i)).toBeInTheDocument();
    const callsBefore = fetchImpl.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /скинути/i }));
    await waitFor(() => {
      expect(fetchImpl.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('should show an error with retry on network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    render(<Home fetchImpl={fetchImpl} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fetchImpl.mockResolvedValue(catalogResponse());
    fireEvent.click(screen.getByRole('button', { name: /спробувати ще/i }));
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
  });

  it('should forward the debounced search text to the catalog query', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(catalogResponse([]));
    render(<Home fetchImpl={fetchImpl} />);
    await screen.findByText(/нічого не знайдено/i);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Sauvage' } });
    await waitFor(() => {
      const calls = fetchImpl.mock.calls;
      const last = calls[calls.length - 1][0] as string;
      expect(last).toContain('q=Sauvage');
    });
  });

  it('should open the volume sheet on add and complete the deferred onAdd contract', async () => {
    const onAddToCart = vi.fn();
    render(<Home fetchImpl={vi.fn().mockResolvedValue(catalogResponse())} onAddToCart={onAddToCart} />);
    const addButtons = await screen.findAllByRole('button', { name: /додати/i });
    // Step 1: click opens the volume sheet (owned by ProductCard/VolumeSheet).
    fireEvent.click(addButtons[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // Step 2: picking a volume resolves the documented onAdd (productId, variantId).
    const options = await screen.findAllByRole('radio');
    fireEvent.click(options[0]);
    expect(onAddToCart).toHaveBeenCalledWith(1, 11);
    expect(loadCart()).toEqual([
      expect.objectContaining({ productId: '1', variantId: 11, volume_ml: 3, qty: 1 }),
    ]);
    expect(screen.getByText(/додано|добавлено|added/i)).toBeInTheDocument();
  });

  it('should add the in-stock duplicate when volume rows repeat', async () => {
    const dupes: Product[] = [
      {
        ...products[0],
        variants: [
          { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 0 },
          { id: 12, volume_ml: 3, price_minor_uah: 42000, old_price_minor_uah: null, stock: 5 },
          { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
        ],
      },
    ];
    render(<Home fetchImpl={vi.fn().mockResolvedValue(catalogResponse(dupes))} />);
    const addButtons = await screen.findAllByRole('button', { name: /додати/i });
    fireEvent.click(addButtons[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('radio', { name: /3\s?ml/i }));
    expect(loadCart()).toEqual([
      expect.objectContaining({ productId: '1', variantId: 12, volume_ml: 3, qty: 1 }),
    ]);
    expect(screen.getByText(/додано|добавлено|added/i)).toBeInTheDocument();
  });

  it('should not claim success when the picked line could not persist', async () => {
    Object.defineProperty(window, 'localStorage', { value: null, configurable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<Home fetchImpl={vi.fn().mockResolvedValue(catalogResponse())} />);
      const addButtons = await screen.findAllByRole('button', { name: /додати/i });
      fireEvent.click(addButtons[0]);
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      const options = await screen.findAllByRole('radio');
      fireEvent.click(options[0]);
      expect(loadCart()).toEqual([]);
      expect(screen.queryByText(/додано до кошика|добавлено в корзину|added to cart/i)).not.toBeInTheDocument();
      expect(screen.getByText(/не вдалося додати|не удалось добавить|could not be added/i)).toBeInTheDocument();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('buildCatalogQuery', () => {
  it('should forward server sort keys verbatim and repeat multi-selects', () => {
    const params = buildCatalogQuery(
      {
        ...DEFAULT_FILTERS,
        brands: ['Creed'],
        genders: ['M', 'F'],
        seasons: ['summer', 'winter'],
        sort: 'price_asc',
      },
      'oud',
    );
    expect(params.get('sort')).toBe('price_asc');
    expect(params.getAll('brand')).toEqual(['Creed']);
    expect(params.getAll('gender')).toEqual(['M', 'F']);
    expect(params.getAll('season')).toEqual(['summer', 'winter']);
    expect(params.get('q')).toBe('oud');
  });
});

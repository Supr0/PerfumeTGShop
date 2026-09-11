import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProductPage } from './Product';
import type { Product } from '../components/ProductCard';
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

/** Fixture mirrors the real ProductOut shape: notes are strings, season is an array. */
const product: Product = {
  id: 1,
  name: 'Aventus',
  brand: 'Creed',
  description: 'Citrus oud bestseller',
  family: 'citrus',
  gender: 'M',
  season: ['summer'],
  notes_top: 'Bergamot, Lemon',
  notes_heart: 'Birch',
  notes_base: 'Musk, Amber',
  longevity: 5,
  sillage: 3,
  place_tags: ['daily', 'office'],
  variants: [
    { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 },
    { id: 12, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 0 },
    { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
  ],
};

const similar: Product = {
  id: 2,
  name: 'Green Irish Tweed',
  brand: 'Creed',
  family: 'citrus',
  season: ['spring'],
  variants: [{ id: 21, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 4 }],
};

function catalogOf(items: Product[]) {
  return { ok: true, status: 200, json: async () => ({ items, total: items.length }) };
}

beforeEach(() => {
  // jsdom without a url has an opaque origin (no working localStorage) —
  // same MemoryStorage stand-in as Home.test.tsx so store writes behave.
  Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });
  vi.restoreAllMocks();
});

afterEach(() => cleanup());

describe('ProductPage presentational', () => {
  it('should switch price when volume changes', () => {
    render(<ProductPage product={product} fetchImpl={vi.fn().mockResolvedValue(catalogOf([]))} />);
    expect(screen.getByText(/390/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /10\s?ml/i }));
    expect(screen.getByText(/990/)).toBeInTheDocument();
  });

  it('should render description, notes pyramid and characteristics', () => {
    render(<ProductPage product={product} fetchImpl={vi.fn().mockResolvedValue(catalogOf([]))} />);
    expect(screen.getByText('Citrus oud bestseller')).toBeInTheDocument();
    // Comma-joined API strings render as separate items.
    expect(screen.getByText('Bergamot')).toBeInTheDocument();
    expect(screen.getByText('Lemon')).toBeInTheDocument();
    expect(screen.getByText('Birch')).toBeInTheDocument();
    expect(screen.getByText('Musk')).toBeInTheDocument();
    expect(screen.getByText('Amber')).toBeInTheDocument();
    // Characteristics come from real ProductOut fields.
    expect(screen.getByText('citrus')).toBeInTheDocument();
    expect(screen.getByText('summer')).toBeInTheDocument();
    expect(screen.getByText('daily, office')).toBeInTheDocument();
  });

  it('should toast on add-to-cart via callback prop', () => {
    const onAddToCart = vi.fn();
    render(
      <ProductPage product={product} onAddToCart={onAddToCart} fetchImpl={vi.fn().mockResolvedValue(catalogOf([]))} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /додати|добавить|add/i }));
    expect(onAddToCart).toHaveBeenCalledWith(1, 11);
    expect(screen.getByText(/додано|добавлено|added/i)).toBeInTheDocument();
  });
});

describe('ProductPage add-to-cart (real store)', () => {
  it('should write the default in-stock variant line to the cart store on Add', () => {
    render(<ProductPage product={product} fetchImpl={vi.fn().mockResolvedValue(catalogOf([]))} />);
    fireEvent.click(screen.getByRole('button', { name: /додати|добавить|add/i }));
    expect(loadCart()).toEqual([
      expect.objectContaining({ productId: '1', variantId: 11, volume_ml: 3, qty: 1 }),
    ]);
    expect(screen.getByText(/додано|добавлено|added/i)).toBeInTheDocument();
  });

  it('should honor the selected volume when writing the cart line', () => {
    render(<ProductPage product={product} fetchImpl={vi.fn().mockResolvedValue(catalogOf([]))} />);
    fireEvent.click(screen.getByRole('radio', { name: /10\s?ml/i }));
    fireEvent.click(screen.getByRole('button', { name: /додати|добавить|add/i }));
    expect(loadCart()).toEqual([
      expect.objectContaining({ productId: '1', variantId: 13, volume_ml: 10, qty: 1 }),
    ]);
    expect(screen.getByText(/додано|добавлено|added/i)).toBeInTheDocument();
  });

  it('should keep the out-of-stock volume unselectable and unaddable', () => {
    render(<ProductPage product={product} fetchImpl={vi.fn().mockResolvedValue(catalogOf([]))} />);
    // The OOS 5 ml option is disabled at the selector — it cannot be picked.
    expect(screen.getByRole('radio', { name: /5\s?ml/i })).toBeDisabled();
    expect(loadCart()).toEqual([]);
  });

  it('should disable Add and write nothing when every variant is out of stock', () => {
    const oosProduct: Product = {
      ...product,
      variants: product.variants.map((v) => ({ ...v, stock: 0 })),
    };
    render(<ProductPage product={oosProduct} fetchImpl={vi.fn().mockResolvedValue(catalogOf([]))} />);
    const add = screen.getByRole('button', { name: /додати|добавить|add/i });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(loadCart()).toEqual([]);
  });

  it('should not claim success when the line could not persist', () => {
    Object.defineProperty(window, 'localStorage', { value: null, configurable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<ProductPage product={product} fetchImpl={vi.fn().mockResolvedValue(catalogOf([]))} />);
      fireEvent.click(screen.getByRole('button', { name: /додати|добавить|add/i }));
      expect(loadCart()).toEqual([]);
      expect(screen.queryByText(/додано до кошика|добавлено в корзину|added to cart/i)).not.toBeInTheDocument();
      expect(screen.getByText(/не вдалося додати|не удалось добавить|could not be added/i)).toBeInTheDocument();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('ProductPage data (productId)', () => {
  function routeMock() {
    return vi.fn(async (input: string) => {
      const url = String(input);
      if (url.startsWith('/v1/products/')) return { ok: true, status: 200, json: async () => product };
      return catalogOf([]);
    });
  }

  it('should show skeletons while the detail loads', () => {
    const fetchImpl = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<ProductPage productId={1} fetchImpl={fetchImpl} />);
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1);
  });

  it('should fetch the detail by id and render it', async () => {
    render(<ProductPage productId={1} fetchImpl={routeMock()} />);
    expect(await screen.findByRole('heading', { name: 'Aventus' })).toBeInTheDocument();
  });

  it('should show an error with retry when the detail fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    render(<ProductPage productId={1} fetchImpl={fetchImpl} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fetchImpl.mockImplementation(routeMock().getMockImplementation() ?? (async () => catalogOf([])));
    fireEvent.click(screen.getByRole('button', { name: /спробувати ще/i }));
    expect(await screen.findByRole('heading', { name: 'Aventus' })).toBeInTheDocument();
  });
});

describe('ProductPage Similar', () => {
  it('should list same-brand items and exclude self', async () => {
    render(<ProductPage product={product} fetchImpl={vi.fn().mockResolvedValue(catalogOf([product, similar]))} />);
    expect(await screen.findByRole('link', { name: 'Green Irish Tweed' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Aventus' })).not.toBeInTheDocument();
  });

  it('should fall back to the family catalog when the brand has nothing else', async () => {
    const familyMatch: Product = { ...similar, id: 3, name: 'Citrus Fellow', brand: 'Other' };
    const fetchImpl = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes('family=')) return catalogOf([familyMatch]);
      return catalogOf([product]);
    });
    render(<ProductPage product={product} fetchImpl={fetchImpl} />);
    expect(await screen.findByRole('link', { name: 'Citrus Fellow' })).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes('brand=Creed'))).toBe(true);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes('family=citrus'))).toBe(true);
  });

  it('should render a graceful empty when there is nothing similar', async () => {
    render(<ProductPage product={product} fetchImpl={vi.fn().mockResolvedValue(catalogOf([product]))} />);
    expect(await screen.findByText(/немає схожих|нет похожих|no similar/i)).toBeInTheDocument();
  });
});

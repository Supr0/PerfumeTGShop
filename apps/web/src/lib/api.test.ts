import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CATALOG_URL,
  DEFAULT_CATALOG_LIMIT,
  fetchCatalog,
  fetchProduct,
  parseOutOfStockVolumes,
} from './api';

const VARIANTS = [
  { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 },
  { id: 12, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 1 },
];

const PRODUCT = {
  id: 1,
  name: 'Aventus',
  brand: 'Creed',
  description: 'Citrus bestseller',
  family: 'citrus',
  variants: VARIANTS,
};

function okJson(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe('fetchCatalog', () => {
  it('should GET /v1/catalog with default limit 60 and return items/total', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ items: [PRODUCT], total: 1 }));
    const page = await fetchCatalog(new URLSearchParams(), fetchFn);
    expect(page).toEqual({ items: [PRODUCT], total: 1 });
    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url.startsWith(CATALOG_URL)).toBe(true);
    expect(url).toContain(`limit=${DEFAULT_CATALOG_LIMIT}`);
    expect(DEFAULT_CATALOG_LIMIT).toBe(60);
  });

  it('should forward filter params verbatim and keep an explicit limit', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ items: [], total: 0 }));
    const params = new URLSearchParams();
    params.append('brand', 'Creed');
    params.set('sort', 'price_asc');
    params.set('limit', '10');
    await fetchCatalog(params, fetchFn);
    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain('brand=Creed');
    expect(url).toContain('sort=price_asc');
    expect(url).toContain('limit=10');
    expect(url).not.toContain('limit=60');
  });

  it('should attach initData auth headers', async () => {
    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: 'user=%7B%22id%22%3A1%7D&hash=abc',
        ready: () => {},
        expand: () => {},
      },
    };
    const fetchFn = vi.fn().mockResolvedValue(okJson({ items: [], total: 0 }));
    await fetchCatalog(new URLSearchParams(), fetchFn);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers['X-Telegram-Init-Data']).toContain('hash=abc');
  });

  it('should map a rejection to a network error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('down'));
    await expect(fetchCatalog(new URLSearchParams(), fetchFn)).rejects.toEqual({ kind: 'network' });
  });

  it('should map a 500 to an http error with status and detail', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: 'boom' }) });
    await expect(fetchCatalog(new URLSearchParams(), fetchFn)).rejects.toEqual({
      kind: 'http',
      status: 500,
      detail: 'boom',
    });
  });
});

describe('fetchProduct', () => {
  it('should GET /v1/products/:id and return the product', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson(PRODUCT));
    const product = await fetchProduct(1, fetchFn);
    expect(product).toEqual(PRODUCT);
    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toBe('/v1/products/1');
  });

  it('should map a 404 to an http error with status', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: 'Product not found' }) });
    await expect(fetchProduct(999, fetchFn)).rejects.toEqual({
      kind: 'http',
      status: 404,
      detail: 'Product not found',
    });
  });

  it('should map a rejection to a network error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('down'));
    await expect(fetchProduct(1, fetchFn)).rejects.toEqual({ kind: 'network' });
  });
});

describe('409 out-of-stock shape', () => {
  it('should preserve the volumes array on the http error', async () => {
    const volumes = [
      { variant_id: 11, ml: 3, stock: 0 },
      { variant_id: 12, ml: 5, stock: 2 },
    ];
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail: 'out_of_stock', volumes }) });
    await expect(fetchCatalog(new URLSearchParams(), fetchFn)).rejects.toEqual({
      kind: 'http',
      status: 409,
      detail: 'out_of_stock',
      volumes,
    });
  });

  it('should parse only well-formed volume rows', () => {
    expect(
      parseOutOfStockVolumes({
        detail: 'out_of_stock',
        volumes: [
          { variant_id: 11, ml: 3, stock: 0 },
          { variant_id: 'bad', ml: 5, stock: 2 },
          null,
        ],
      }),
    ).toEqual([{ variant_id: 11, ml: 3, stock: 0 }]);
    expect(parseOutOfStockVolumes({ detail: 'out_of_stock' })).toEqual([]);
    expect(parseOutOfStockVolumes(null)).toEqual([]);
  });
});

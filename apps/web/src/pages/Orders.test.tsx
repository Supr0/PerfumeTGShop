import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Orders from './Orders';

const ORDER = {
  number: 'AB12CD34',
  status: 'new',
  ttn: '20400012345678',
  total: 78000,
  created: '2026-09-08T12:00:00.000Z',
  // Line sum is 390 ₴ on purpose: the server total (780 ₴) must win,
  // proving the real-total path instead of the line-sum fallback.
  items: [{ variant_id: 11, qty: 1, price_minor_uah: 39000 }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

afterEach(() => cleanup());

describe('Orders page', () => {
  it('should show loading skeletons while fetching', () => {
    const fetchImpl = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<Orders fetchImpl={fetchImpl} />);
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1);
  });

  it('should show an empty state when there are no orders', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    render(<Orders fetchImpl={fetchImpl} />);
    expect(await screen.findByText(/замовлень поки немає|заказов пока нет|no orders/i)).toBeInTheDocument();
  });

  it('should list number, status, ttn, total and items plus a seller link', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [ORDER] });
    render(<Orders fetchImpl={fetchImpl} />);
    expect(await screen.findByText(/AB12CD34/)).toBeInTheDocument();
    expect(screen.getByText(/20400012345678/)).toBeInTheDocument();
    // 2 × 39000 minor = 780 ₴ display-only total.
    expect(screen.getByText(/780/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /написати продавцю|написать продавцу/i })).toBeInTheDocument();
  });

  it('should show an error state with retry that refetches', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [ORDER] });
    render(<Orders fetchImpl={fetchImpl} />);
    expect(await screen.findByText(/не вдалося|не удалось|failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /спробувати ще|повторити|retry|попробовать/i }));
    expect(await screen.findByText(/AB12CD34/)).toBeInTheDocument();
    // Retry refetches the list plus the single catalog name lookup.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('should send initData auth headers when fetching the list', async () => {
    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: { initData: 'user=%7B%7D&hash=abc', ready: () => {}, expand: () => {} },
    };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    render(<Orders fetchImpl={fetchImpl} />);
    await screen.findByText(/замовлень поки немає|заказов пока нет|no orders/i);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Telegram-Init-Data']).toContain('hash=abc');
  });

  it('should fetch the list plus exactly one catalog lookup on the prod path (no fetchImpl prop)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<Orders />);
      await screen.findByText(/замовлень поки немає|заказов пока нет|no orders/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls[0]).toBe('/v1/orders/mine');
      expect(urls[1].startsWith('/v1/catalog')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should resolve line names from one catalog fetch', async () => {
    const catalogProduct = {
      id: 7,
      name: 'Aventus',
      variants: [{ id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 }],
    };
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.startsWith('/v1/catalog')) {
        return { ok: true, status: 200, json: async () => ({ items: [catalogProduct], total: 1 }) };
      }
      return { ok: true, status: 200, json: async () => [ORDER] };
    });
    render(<Orders fetchImpl={fetchImpl} />);
    expect(await screen.findByText('Aventus · 3 мл × 1 · 390 ₴')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).startsWith('/v1/catalog'))).toHaveLength(1);
  });

  it('should fall back to the variant label when the catalog fetch fails', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.startsWith('/v1/catalog')) throw new Error('catalog down');
      return { ok: true, status: 200, json: async () => [ORDER] };
    });
    render(<Orders fetchImpl={fetchImpl} />);
    expect(await screen.findByText('Варіант 11 × 1')).toBeInTheDocument();
  });
});

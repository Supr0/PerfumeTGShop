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
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
});

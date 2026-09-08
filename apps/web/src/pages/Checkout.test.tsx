import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Checkout, { buildCheckoutBody, isValidPhoneNumber, normalizePhoneNumber } from './Checkout';
import { persistCart } from '../lib/cart';
import type { CartState } from '../lib/cart';

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

const ITEMS: CartState = [
  { productId: '1', variantId: 11, volume_ml: 3, qty: 2, price: 390, name: 'Aventus' },
];

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/ім'я|имя|name/i), { target: { value: 'Олена' } });
  fireEvent.change(screen.getByLabelText(/телефон/i), { target: { value: '+380501234567' } });
  fireEvent.change(screen.getByLabelText(/місто|город|city/i), { target: { value: 'Львів' } });
  fireEvent.change(screen.getByLabelText(/відділення|отделение|branch/i), {
    target: { value: 'Відділення №1' },
  });
}

function renderCheckout(fetchImpl: ReturnType<typeof vi.fn>, items: CartState = ITEMS) {
  return render(<Checkout fetchImpl={fetchImpl} initialItems={items} />);
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });
  persistCart(ITEMS);
  vi.restoreAllMocks();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

afterEach(() => cleanup());

describe('checkout phone validation (mirrors server ^\\+380\\d{9}$)', () => {
  it.each([
    ['+380501234567', '+380501234567'],
    ['+380 50 123 45 67', '+380501234567'],
    ['+380-50-123-45-67', '+380501234567'],
    ['+380 (50) 123-45-67', '+380501234567'],
  ])('should normalize %s to %s', (raw, expected) => {
    expect(normalizePhoneNumber(raw)).toBe(expected);
  });

  it.each([['+380501234567'], ['+380 (67) 111-22-33']])('should accept %s', (raw) => {
    expect(isValidPhoneNumber(normalizePhoneNumber(raw))).toBe(true);
  });

  it.each([['0501234567'], ['+38050123456'], ['+3805012345678'], ['+48123456789'], ['']])(
    'should reject %s',
    (raw) => {
      expect(isValidPhoneNumber(normalizePhoneNumber(raw))).toBe(false);
    },
  );

  it('should show an inline phone error naming the +380 format', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ number: 'AB12CD34' }) });
    renderCheckout(fetchImpl);
    fireEvent.change(screen.getByLabelText(/телефон/i), { target: { value: '0501234567' } });
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    expect(await screen.findByText(/\+380/i)).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url]) => url === '/v1/orders')).toBe(false);
  });
});

describe('checkout submit', () => {
  it('should send items as variant_id/qty with neither total nor idempotency_key in body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ number: 'AB12CD34' }),
    });
    renderCheckout(fetchImpl);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    await screen.findByText(/Дякуємо! Замовлення №AB12CD34/);
    const orderCall = fetchImpl.mock.calls.find(([url]) => url === '/v1/orders') as
      | [string, RequestInit]
      | undefined;
    expect(orderCall).toBeDefined();
    const [, init] = orderCall as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.items).toEqual([{ variant_id: 11, qty: 2 }]);
    expect(body).not.toHaveProperty('total');
    expect(body).not.toHaveProperty('idempotency_key');
    expect(body).not.toHaveProperty('idempotencyKey');
    expect(JSON.stringify(body)).not.toContain('total');
    expect(JSON.stringify(body)).not.toContain('idempotency');
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/.+/);
  });

  it('should build a server-acceptable body (OrderCreate contract: no extra keys, name<=80)', () => {
    const body = buildCheckoutBody(ITEMS, {
      name: 'Олена',
      phone: '+380 (50) 123-45-67',
      city: 'Львів',
      branch: 'Відділення №1',
      comment: '',
    });
    // Exact keys the server allows (extra="forbid" rejects total/idempotency_key).
    expect(Object.keys(body).sort()).toEqual(
      ['branch', 'city', 'comment', 'items', 'name', 'phone'].sort(),
    );
    expect(body.name.length).toBeLessThanOrEqual(80);
    expect(body.city.length).toBeLessThanOrEqual(120);
    expect(body.branch.length).toBeLessThanOrEqual(120);
    expect(isValidPhoneNumber(normalizePhoneNumber(body.phone))).toBe(true);
  });

  it('should generate a fresh Idempotency-Key per attempt and disable submit while pending', async () => {
    let resolveFirst!: (v: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const first = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    let orderCalls = 0;
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url === '/v1/settings/public') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ card_requisites: 'Картка 4111 1111 1111 1111' }),
        });
      }
      orderCalls += 1;
      if (orderCalls === 1) return first;
      return Promise.resolve({ ok: true, status: 201, json: async () => ({ number: 'ZZ99YY88' }) });
    });
    renderCheckout(fetchImpl);
    fillValidForm();
    const submit = screen.getByRole('button', { name: /підтвердити|оформити|замовити/i });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    resolveFirst({ ok: true, status: 201, json: async () => ({ number: 'AA11BB22' }) });
    await screen.findByText(/Дякуємо! Замовлення №AA11BB22/);

    // Second attempt (fresh render with items again) must carry a different key.
    cleanup();
    persistCart(ITEMS);
    renderCheckout(fetchImpl);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    await screen.findByText(/Дякуємо! Замовлення №ZZ99YY88/);
    const orderInits = fetchImpl.mock.calls
      .filter(([url]) => url === '/v1/orders')
      .map(([, init]) => init as RequestInit);
    const key1 = orderInits[0].headers as Record<string, string>;
    const key2 = orderInits[1].headers as Record<string, string>;
    expect(key1['Idempotency-Key']).toMatch(/.+/);
    expect(key2['Idempotency-Key']).toMatch(/.+/);
    expect(key1['Idempotency-Key']).not.toBe(key2['Idempotency-Key']);
  });

  it('should render the thank-you screen with order number and clear the cart on 201', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ number: 'AB12CD34' }),
    });
    renderCheckout(fetchImpl);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    await screen.findByText(/Дякуємо! Замовлення №AB12CD34/);
    expect(window.localStorage.getItem('freshdoze:cart:guest')).toBe('[]');
  });

  it.each([
    ['missing number', {}],
    ['non-string number', { number: 12345 }],
    ['null payload', null],
  ])('should show an error and keep the cart when 201 carries %s', async (_label, payload) => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => payload,
    });
    renderCheckout(fetchImpl);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    expect(await screen.findByText(/не вдалося оформити/i)).toBeInTheDocument();
    expect(window.localStorage.getItem('freshdoze:cart:guest')).not.toBe('[]');
  });

  it('should render per-volume stock rows from the real 409 shape with a return-to-cart link', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        detail: 'out_of_stock',
        volumes: [
          { variant_id: 11, ml: 3, stock: 0 },
          { variant_id: 12, ml: 5, stock: 2 },
        ],
      }),
    });
    renderCheckout(fetchImpl);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    expect(await screen.findByText('3 мл — немає в наявності')).toBeInTheDocument();
    expect(screen.getByText('5 мл — залишилося 2 шт.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /кошик|корзина|cart/i })).toHaveAttribute('href', '#/cart');
  });

  it('should fall back to a generic message when 409 carries no volumes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: 'out_of_stock' }),
    });
    renderCheckout(fetchImpl);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    expect(await screen.findByText('Немає в наявності')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /кошик|корзина|cart/i })).toHaveAttribute('href', '#/cart');
  });

  it('should render field errors on 422', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [
          { loc: ['body', 'phone'], msg: 'Invalid phone format' },
          { loc: ['body', 'city'], msg: 'City is required' },
        ],
      }),
    });
    renderCheckout(fetchImpl);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    expect(await screen.findByText(/Invalid phone format/)).toBeInTheDocument();
    expect(screen.getByText(/City is required/)).toBeInTheDocument();
  });

  it('should render requisites text from the public settings API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        dispatch_city: 'Львів',
        card_requisites: 'Картка 4111 1111 1111 1111',
        payment_enabled: false,
      }),
    });
    renderCheckout(fetchImpl);
    expect(await screen.findByText('Картка 4111 1111 1111 1111')).toBeInTheDocument();
    expect(screen.getByText(/доставку сплачує покупець/i)).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledWith(
      '/v1/settings/public',
      expect.objectContaining({ headers: expect.anything() }),
    );
  });

  it('should show a neutral skeleton while requisites load', () => {
    const fetchImpl = vi.fn().mockImplementation(() => new Promise(() => {}));
    renderCheckout(fetchImpl);
    expect(screen.getByLabelText('Завантаження реквізитів…')).toBeInTheDocument();
    expect(screen.queryByText('Картка 4111 1111 1111 1111')).not.toBeInTheDocument();
    expect(screen.getByText(/доставку сплачує покупець/i)).toBeInTheDocument();
  });

  it('should show a generic fallback with seller link when requisites fail', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'));
    renderCheckout(fetchImpl);
    expect(await screen.findByText('Реквізити уточнить менеджер')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /написати продавцю/i })).toBeInTheDocument();
    expect(screen.getByText(/доставку сплачує покупець/i)).toBeInTheDocument();
  });

  it('should offer the preset city list with Lviv default while allowing free text', () => {
    const fetchImpl = vi.fn();
    renderCheckout(fetchImpl);
    const city = screen.getByLabelText(/місто|город|city/i) as HTMLInputElement;
    expect(city.value).toBe('Львів');
    expect(city.getAttribute('list')).toBeTruthy();
  });

  it('should reject an over-long comment without calling the API', async () => {
    const fetchImpl = vi.fn();
    renderCheckout(fetchImpl);
    fillValidForm();
    fireEvent.change(screen.getByLabelText(/коментар|комментарий|comment/i), {
      target: { value: 'x'.repeat(501) },
    });
    fireEvent.click(screen.getByRole('button', { name: /підтвердити|оформити|замовити/i }));
    await waitFor(() => {
      expect(screen.getByText(/500/i)).toBeInTheDocument();
    });
    expect(fetchImpl.mock.calls.some(([url]) => url === '/v1/orders')).toBe(false);
  });
});

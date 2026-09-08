import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Admin from './Admin';

const PRODUCTS = [
  { id: 1, name: 'Aventus', brand: 'Creed', is_active: true, is_hit: true, variants: [{ volume_ml: 5, price_minor_uah: 10000, stock: 9 }] },
];
const ORDERS = [{ number: 'AB12CD34', status: 'new', ttn: null, total: 20000 }];
const SETTINGS = {
  dispatch_city: 'Львів',
  card_requisites: 'Картка 4111',
  payment_provider_key: null,
  payment_enabled: false,
  usernames: ['manager_one'],
};

afterEach(() => cleanup());

function routeFetch() {
  return vi.fn(async (input: string) => {
    if (input === '/v1/admin/me') return { ok: true, status: 200, json: async () => ({ is_admin: true }) };
    if (input === '/v1/admin/products') return { ok: true, status: 200, json: async () => PRODUCTS };
    if (input === '/v1/admin/orders') return { ok: true, status: 200, json: async () => ORDERS };
    if (input === '/v1/admin/settings') return { ok: true, status: 200, json: async () => SETTINGS };
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

describe('Admin page gate', () => {
  it('should render "Немає доступу" and fetch nothing else on 403', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ detail: 'forbidden' }) });
    render(<Admin fetchImpl={fetchImpl} />);
    expect(await screen.findByText('Немає доступу')).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('/v1/admin/me');
  });

  it('should render Products/Orders/Settings sections after /admin/me 200', async () => {
    render(<Admin fetchImpl={routeFetch()} />);
    expect(await screen.findByRole('tablist', { name: /розділи/i })).toBeInTheDocument();
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Замовлення' }));
    expect(await screen.findByText('AB12CD34')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Налаштування' }));
    expect(await screen.findByLabelText(/місто відправки/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/юзернейми/i)).toHaveValue('manager_one');
  });

  it('should toast on order save', async () => {
    const fetchImpl = routeFetch();
    render(<Admin fetchImpl={fetchImpl} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Замовлення' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('Збережено')).toBeInTheDocument();
  });
});

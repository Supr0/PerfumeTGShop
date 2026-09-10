import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Home } from '../pages/Home';
import { ProductPage, characteristicsOf } from '../pages/Product';
import { ProductCard, type Product } from '../components/ProductCard';
import { VolumeSelector } from '../components/VolumeSelector';
import { FilterSheet, DEFAULT_FILTERS } from '../components/FilterSheet';
import Checkout from '../pages/Checkout';
import Orders from '../pages/Orders';
import Admin from '../pages/Admin';
import App from '../App';
import { persistCart } from '../lib/cart';
import type { CartState } from '../lib/cart';
import ru from './ru.json';

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
    ],
  },
];

const detail: Product = {
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
  ],
};

const ITEMS: CartState = [
  { productId: '1', variantId: 11, volume_ml: 3, qty: 2, price: 390, name: 'Aventus' },
];

function catalogResponse(items: Product[] = products) {
  return { ok: true, status: 200, json: async () => ({ items, total: items.length }) };
}

function settingsResponse(requisites = 'Карта 4111 1111 1111 1111') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ dispatch_city: 'Львов', card_requisites: requisites, payment_enabled: false }),
  };
}

function adminRouteFetch() {
  return vi.fn(async (input: string) => {
    if (input === '/v1/admin/me') return { ok: true, status: 200, json: async () => ({ is_admin: true }) };
    if (input === '/v1/admin/products')
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 1,
            name: 'Aventus',
            brand: 'Creed',
            is_active: true,
            is_hit: true,
            variants: [{ volume_ml: 5, price_minor_uah: 10000, stock: 9 }],
          },
        ],
      };
    if (input === '/v1/admin/orders')
      return { ok: true, status: 200, json: async () => [{ number: 'AB12CD34', status: 'new', ttn: null, total: 20000 }] };
    if (input === '/v1/admin/settings')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          dispatch_city: 'Львов',
          card_requisites: 'Карта 4111',
          payment_provider_key: null,
          payment_enabled: false,
          usernames: ['manager_one'],
        }),
      };
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });
  window.location.hash = '#/';
  vi.restoreAllMocks();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '#/';
});

describe('Home RU render', () => {
  it('should render RU search placeholder, chips group and filters button', async () => {
    render(<Home locale="ru" fetchImpl={vi.fn().mockResolvedValue(catalogResponse())} />);
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(ru.search)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: ru.chips_group })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.chips_all })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.filters })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveAccessibleName(ru.search);
  });

  it('should render the RU empty state with reset', async () => {
    render(<Home locale="ru" fetchImpl={vi.fn().mockResolvedValue(catalogResponse([]))} />);
    expect(await screen.findByText(ru.home_empty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.home_reset_filters })).toBeInTheDocument();
  });

  it('should render the RU load error with retry', async () => {
    render(<Home locale="ru" fetchImpl={vi.fn().mockRejectedValue(new Error('down'))} />);
    expect(await screen.findByText(ru.home_load_error)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.retry })).toBeInTheDocument();
  });
});

describe('FilterSheet RU render', () => {
  it('should render the RU dialog title, group labels, sort names and footer', () => {
    render(
      <FilterSheet
        open
        locale="ru"
        brands={['Creed']}
        families={['citrus']}
        genders={['M']}
        seasons={['summer']}
        value={DEFAULT_FILTERS}
        onChange={() => {}}
        onClose={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: ru.filter_title })).toBeInTheDocument();
    expect(screen.getByText(ru.filter_brand)).toBeInTheDocument();
    expect(screen.getByText(ru.filter_gender)).toBeInTheDocument();
    expect(screen.getByText(ru.filter_season)).toBeInTheDocument();
    expect(screen.getByText(ru.filter_in_stock)).toBeInTheDocument();
    expect(screen.getByLabelText(ru.filter_sort)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: ru.sort_popular })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: ru.sort_price_asc })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: ru.sort_price_desc })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: ru.sort_new })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.filter_reset })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.filter_show })).toBeInTheDocument();
  });
});

describe('ProductCard + VolumeSelector RU render', () => {
  it('should render the RU out-of-stock badge and RU add button', () => {
    render(<ProductCard locale="ru" product={products[1]} />);
    expect(screen.getAllByText(ru.out_of_stock).length).toBeGreaterThanOrEqual(1);
    const add = screen.getByRole('button', { name: `Добавить ${products[1].name}` });
    expect(add).toBeDisabled();
    expect(add).toHaveTextContent(ru.add_label);
  });

  it('should render the RU volume radiogroup label', () => {
    render(<VolumeSelector locale="ru" variants={detail.variants} value={3} onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: ru.volume_group })).toBeInTheDocument();
  });
});

describe('ProductPage RU render', () => {
  it('should render RU notes, characteristics and similar headers', () => {
    render(
      <ProductPage locale="ru" product={detail} fetchImpl={vi.fn().mockResolvedValue(catalogResponse([]))} />,
    );
    expect(screen.getByRole('heading', { name: ru.notes_pyramid })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: ru.notes_top })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: ru.notes_heart })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: ru.notes_base })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: ru.specs_title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: ru.similar_title })).toBeInTheDocument();
  });

  it('should build RU characteristic labels via characteristicsOf', () => {
    const rows = characteristicsOf(detail, 'ru');
    const labels = rows.map(([k]) => k);
    expect(labels).toEqual([
      ru.char_family,
      ru.char_gender,
      ru.char_season,
      ru.char_longevity,
      ru.char_sillage,
      ru.char_occasions,
    ]);
  });

  it('should render the RU similar empty state', async () => {
    render(
      <ProductPage locale="ru" product={detail} fetchImpl={vi.fn().mockResolvedValue(catalogResponse([detail]))} />,
    );
    expect(await screen.findByText(ru.similar_empty)).toBeInTheDocument();
  });
});

describe('Checkout RU render', () => {
  it('should render RU title, field labels and submit', async () => {
    persistCart(ITEMS);
    render(<Checkout locale="ru" initialItems={ITEMS} fetchImpl={vi.fn().mockResolvedValue(settingsResponse())} />);
    expect(await screen.findByRole('heading', { name: ru.checkout_title })).toBeInTheDocument();
    expect(screen.getByLabelText(ru.field_name)).toBeInTheDocument();
    expect(screen.getByLabelText(ru.field_phone)).toBeInTheDocument();
    expect(screen.getByLabelText(ru.field_city)).toBeInTheDocument();
    expect(screen.getByLabelText(ru.field_branch)).toBeInTheDocument();
    expect(screen.getByLabelText(ru.field_comment)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.checkout_submit })).toBeInTheDocument();
  });

  it('should render the RU payment block with requisites', async () => {
    persistCart(ITEMS);
    render(<Checkout locale="ru" initialItems={ITEMS} fetchImpl={vi.fn().mockResolvedValue(settingsResponse())} />);
    expect(await screen.findByText('Карта 4111 1111 1111 1111')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: ru.payment_title })).toBeInTheDocument();
    expect(screen.getByText(ru.payment_card)).toBeInTheDocument();
    expect(screen.getByText(ru.payment_delivery)).toBeInTheDocument();
  });

  it('should show the RU phone error naming the +380 format', async () => {
    persistCart(ITEMS);
    const fetchImpl = vi.fn().mockResolvedValue(settingsResponse());
    render(<Checkout locale="ru" initialItems={ITEMS} fetchImpl={fetchImpl} />);
    await screen.findByRole('heading', { name: ru.checkout_title });
    fireEvent.change(screen.getByLabelText(ru.field_name), { target: { value: 'Олена' } });
    fireEvent.change(screen.getByLabelText(ru.field_phone), { target: { value: '0501234567' } });
    fireEvent.change(screen.getByLabelText(ru.field_city), { target: { value: 'Львів' } });
    fireEvent.change(screen.getByLabelText(ru.field_branch), { target: { value: 'Відділення №1' } });
    fireEvent.click(screen.getByRole('button', { name: ru.checkout_submit }));
    expect(await screen.findByText(ru.err_phone)).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url]) => url === '/v1/orders')).toBe(false);
  });
});

describe('Orders RU render', () => {
  it('should render the RU heading and RU empty state', async () => {
    render(<Orders locale="ru" fetchImpl={vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] })} />);
    expect(await screen.findByRole('heading', { name: ru.orders_title })).toBeInTheDocument();
    expect(screen.getByText(ru.orders_empty)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ru.orders_to_catalog })).toBeInTheDocument();
  });
});

describe('Admin RU render', () => {
  it('should render the RU denied gate', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ detail: 'forbidden' }) });
    render(<Admin locale="ru" fetchImpl={fetchImpl} />);
    expect(await screen.findByText(ru.admin_denied)).toBeInTheDocument();
  });

  it('should render RU tabs, product form and settings form', async () => {
    render(<Admin locale="ru" fetchImpl={adminRouteFetch()} />);
    expect(await screen.findByRole('tab', { name: ru.admin_products_tab })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: ru.admin_orders_tab })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: ru.admin_settings_tab })).toBeInTheDocument();
    expect(await screen.findByLabelText(ru.admin_f_name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.admin_add_product })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: ru.admin_orders_tab }));
    expect(await screen.findByText('AB12CD34')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: ru.admin_settings_tab }));
    expect(await screen.findByLabelText(ru.admin_city)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.admin_save_settings })).toBeInTheDocument();
  });
});

describe('App shell RU toggle end-to-end', () => {
  it('should switch page content (not just the tab bar) when RU is toggled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes('/v1/admin/me')) return { ok: false, status: 403, json: async () => ({ detail: 'forbidden' }) };
        if (url.includes('/v1/catalog')) return catalogResponse();
        return { ok: false, status: 404, json: async () => ({ detail: 'not found' }) };
      }),
    );
    render(<App />);
    expect(await screen.findByText('Aventus')).toBeInTheDocument();
    // UK by default: tab bar and catalog chrome are Ukrainian.
    expect(screen.getByRole('tab', { name: 'Кошик' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Пошук')).toBeInTheDocument();
    // Toggle to RU: the reported bug was the switcher moving only the tab bar.
    fireEvent.click(screen.getByRole('button', { name: 'RU' }));
    expect(screen.getByRole('tab', { name: ru.cart })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(ru.search)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.filters })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: ru.chips_group })).toBeInTheDocument();
    expect(window.localStorage.getItem('freshdoze:locale')).toBe('ru');
  });
});

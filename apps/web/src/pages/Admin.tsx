/**
 * Admin page: Products / Orders / Settings, gated by GET /v1/admin/me.
 *
 * A non-200 gate renders "Немає доступу" and fetches nothing else.
 * All mutations mirror server validation (volumes 3/5/10, username list
 * ^[A-Za-z0-9_]{5,32}$ max 20) and toast on save.
 */
import { useCallback, useEffect, useState } from 'react';
import { Skeleton, Toast } from '../components/feedback';
import { authHeaders } from '../lib/tma';
import type { FetchImpl } from './Checkout';

export const ADMIN_ME_URL = '/v1/admin/me';
export const ADMIN_PRODUCTS_URL = '/v1/admin/products';
export const ADMIN_ORDERS_URL = '/v1/admin/orders';
export const ADMIN_SETTINGS_URL = '/v1/admin/settings';
export const ADMIN_PROMOS_URL = '/v1/admin/promos';

export const ADMIN_DENIED_LABEL = 'Немає доступу';
export const ADMIN_SAVED_LABEL = 'Збережено';

type Gate = 'checking' | 'denied' | 'allowed';
type Section = 'products' | 'orders' | 'settings';

export interface AdminVariant {
  id?: number;
  volume_ml: number;
  price_minor_uah: number;
  old_price_minor_uah?: number | null;
  stock: number;
}

export interface AdminProduct {
  id: number;
  name: string;
  brand?: string | null;
  image?: string | null;
  is_active: boolean;
  is_hit: boolean;
  variants: AdminVariant[];
}

export interface AdminOrder {
  number: string;
  status: string;
  ttn?: string | null;
  total?: number | null;
}

export interface AdminSettings {
  dispatch_city: string;
  card_requisites: string;
  payment_provider_key?: string | null;
  payment_enabled: boolean;
  usernames: string[];
}

const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const ALLOWED_VOLUMES = [3, 5, 10];

interface AdminProps {
  fetchImpl?: FetchImpl;
  meUrl?: string;
  productsUrl?: string;
  ordersUrl?: string;
  settingsUrl?: string;
  promosUrl?: string;
}

const defaultFetch: FetchImpl = (input, init) => fetch(input, init);

async function readJson(res: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function OrderRow({
  order,
  ordersUrl,
  fetcher,
  onSaved,
}: {
  order: AdminOrder;
  ordersUrl: string;
  fetcher: FetchImpl;
  onSaved: (message: string) => void;
}) {
  const [status, setStatus] = useState(order.status);
  const [ttn, setTtn] = useState(order.ttn ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetcher(`${ordersUrl}/${order.number}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        // Blank TTN sends null (no-op server-side), never an empty string
        // that could wipe a stored TTN.
        body: JSON.stringify({ status, ttn: ttn.trim() === '' ? null : ttn }),
      });
      if (res.ok) onSaved(ADMIN_SAVED_LABEL);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td>{order.number}</td>
      <td>
        <select aria-label={`Статус ${order.number}`} value={status} onChange={(e) => setStatus(e.target.value)}>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input aria-label={`ТТН ${order.number}`} value={ttn} onChange={(e) => setTtn(e.target.value)} />
      </td>
      <td>
        <button type="button" disabled={saving} onClick={() => void save()}>
          Зберегти
        </button>
      </td>
    </tr>
  );
}

function ProductForm({
  productsUrl,
  fetcher,
  onSaved,
}: {
  productsUrl: string;
  fetcher: FetchImpl;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [oldPrice, setOldPrice] = useState('');
  const [stock, setStock] = useState('');
  const [volume, setVolume] = useState('5');
  const [photo, setPhoto] = useState('');
  const [isHit, setIsHit] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetcher(productsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        name,
        brand: brand || null,
        image: photo || null,
        is_active: true,
        is_hit: isHit,
        variants: [
          {
            volume_ml: Number(volume),
            price_minor_uah: Number(price),
            old_price_minor_uah: oldPrice === '' ? null : Number(oldPrice),
            stock: Number(stock),
          },
        ],
      }),
    });
    if (res.ok) {
      onSaved(ADMIN_SAVED_LABEL);
      setName('');
      setBrand('');
      setPrice('');
      setOldPrice('');
      setStock('');
      setPhoto('');
      setIsHit(false);
    }
  };

  return (
    <form aria-label="Новий товар" onSubmit={(e) => void create(e)}>
      <input aria-label="Назва" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      <input aria-label="Бренд" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={200} />
      <input aria-label="Ціна (коп.)" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" />
      <input aria-label="Стара ціна (коп.)" value={oldPrice} onChange={(e) => setOldPrice(e.target.value)} inputMode="numeric" />
      <input aria-label="Залишок" value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" />
      <select aria-label="Обʼєм" value={volume} onChange={(e) => setVolume(e.target.value)}>
        {ALLOWED_VOLUMES.map((v) => (
          <option key={v} value={String(v)}>
            {v} мл
          </option>
        ))}
      </select>
      <input aria-label="Фото (URL)" value={photo} onChange={(e) => setPhoto(e.target.value)} maxLength={300} />
      <label>
        <input type="checkbox" checked={isHit} onChange={(e) => setIsHit(e.target.checked)} />
        Хіт
      </label>
      <button type="submit">Додати товар</button>
    </form>
  );
}

export default function Admin({
  fetchImpl,
  meUrl = ADMIN_ME_URL,
  productsUrl = ADMIN_PRODUCTS_URL,
  ordersUrl = ADMIN_ORDERS_URL,
  settingsUrl = ADMIN_SETTINGS_URL,
  promosUrl = ADMIN_PROMOS_URL,
}: AdminProps) {
  const fetcher: FetchImpl = fetchImpl ?? defaultFetch;
  const [gate, setGate] = useState<Gate>('checking');
  const [section, setSection] = useState<Section>('products');
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [dispatchCity, setDispatchCity] = useState('');
  const [cardRequisites, setCardRequisites] = useState('');
  const [providerKey, setProviderKey] = useState('');
  const [usernamesText, setUsernamesText] = useState('');
  const [promoId, setPromoId] = useState('');
  const [promoActive, setPromoActive] = useState(false);

  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher(meUrl, { headers: { ...authHeaders() } });
        if (!cancelled) setGate(res.ok ? 'allowed' : 'denied');
      } catch {
        if (!cancelled) setGate('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetcher, meUrl]);

  useEffect(() => {
    if (gate !== 'allowed') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [pRes, oRes, sRes] = await Promise.all([
          fetcher(productsUrl, { headers: { ...authHeaders() } }),
          fetcher(ordersUrl, { headers: { ...authHeaders() } }),
          fetcher(settingsUrl, { headers: { ...authHeaders() } }),
        ]);
        if (cancelled) return;
        if (pRes.ok) setProducts((await readJson(pRes)) as AdminProduct[]);
        if (oRes.ok) setOrders((await readJson(oRes)) as AdminOrder[]);
        const payload = (await readJson(sRes)) as AdminSettings | null;
        if (sRes.ok && payload) {
          setSettings(payload);
          setDispatchCity(payload.dispatch_city);
          setCardRequisites(payload.card_requisites);
          setProviderKey(payload.payment_provider_key ?? '');
          setUsernamesText(payload.usernames.join('\n'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gate, fetcher, productsUrl, ordersUrl, settingsUrl]);

  if (gate === 'checking') {
    return (
      <section aria-label="Адмін">
        <Skeleton height={120} label="Завантаження…" />
      </section>
    );
  }

  if (gate === 'denied') {
    return (
      <section aria-label="Адмін">
        <h1>{ADMIN_DENIED_LABEL}</h1>
      </section>
    );
  }

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const usernames = usernamesText.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
    const res = await fetcher(settingsUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        dispatch_city: dispatchCity,
        card_requisites: cardRequisites,
        payment_provider_key: providerKey || null,
        usernames,
      }),
    });
    if (res.ok) notify(ADMIN_SAVED_LABEL);
  };

  const savePromo = async () => {
    const res = await fetcher(promosUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id: Number(promoId), is_active: promoActive }),
    });
    if (res.ok) notify(ADMIN_SAVED_LABEL);
  };

  return (
    <section aria-label="Адмін">
      <h1>Адмін</h1>
      <div role="tablist" aria-label="Розділи">
        {(['products', 'orders', 'settings'] as Section[]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)}>
            {s === 'products' ? 'Товари' : s === 'orders' ? 'Замовлення' : 'Налаштування'}
          </button>
        ))}
      </div>
      {loading ? (
        <Skeleton height={120} label="Завантаження…" />
      ) : (
        <>
          {section === 'products' && (
            <div>
              <ProductForm productsUrl={productsUrl} fetcher={fetcher} onSaved={notify} />
              <table aria-label="Товари">
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.variants.map((v) => `${v.volume_ml}мл:${v.stock}`).join(', ')}</td>
                      <td>{p.is_hit ? 'хіт' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {section === 'orders' && (
            <table aria-label="Замовлення">
              <tbody>
                {orders.map((o) => (
                  <OrderRow key={o.number} order={o} ordersUrl={ordersUrl} fetcher={fetcher} onSaved={notify} />
                ))}
              </tbody>
            </table>
          )}
          {section === 'settings' && settings && (
            <div>
              <form aria-label="Налаштування" onSubmit={(e) => void saveSettings(e)}>
                <input aria-label="Місто відправки" value={dispatchCity} onChange={(e) => setDispatchCity(e.target.value)} />
                <textarea aria-label="Реквізити" value={cardRequisites} onChange={(e) => setCardRequisites(e.target.value)} />
                <input aria-label="Ключ провайдера" value={providerKey} onChange={(e) => setProviderKey(e.target.value)} />
                <textarea
                  aria-label="Юзернейми (по одному в рядку)"
                  value={usernamesText}
                  onChange={(e) => setUsernamesText(e.target.value)}
                />
                <button type="submit">Зберегти налаштування</button>
              </form>
              <form aria-label="Промо" onSubmit={(e) => { e.preventDefault(); void savePromo(); }}>
                <input aria-label="ID промо" value={promoId} onChange={(e) => setPromoId(e.target.value)} inputMode="numeric" />
                <label>
                  <input type="checkbox" checked={promoActive} onChange={(e) => setPromoActive(e.target.checked)} />
                  Активне
                </label>
                <button type="submit">Зберегти промо</button>
              </form>
            </div>
          )}
        </>
      )}
      {toast && <Toast message={toast} kind="success" />}
    </section>
  );
}

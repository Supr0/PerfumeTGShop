/**
 * Admin page: Products / Orders / Settings, gated by GET /v1/admin/me.
 *
 * A non-200 gate renders the localized "denied" heading and fetches nothing else.
 * All mutations mirror server validation (volumes 3/5/10, username list
 * ^[A-Za-z0-9_]{5,32}$ max 20) and toast on save.
 */
import { useCallback, useEffect, useState } from 'react';
import { Skeleton, Toast } from '../components/feedback';
import { authHeaders } from '../lib/tma';
import type { FetchImpl } from './Checkout';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';

export type AdminLocale = 'uk' | 'ru';

const ADMIN_STRINGS: Record<AdminLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

export const ADMIN_ME_URL = '/v1/admin/me';
export const ADMIN_PRODUCTS_URL = '/v1/admin/products';
export const ADMIN_ORDERS_URL = '/v1/admin/orders';
export const ADMIN_SETTINGS_URL = '/v1/admin/settings';
export const ADMIN_PROMOS_URL = '/v1/admin/promos';

export const ADMIN_DENIED_LABEL: string = ukStrings['admin_denied'] ?? 'admin_denied';
export const ADMIN_SAVED_LABEL: string = ukStrings['admin_saved'] ?? 'admin_saved';

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
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: AdminLocale;
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
  locale = 'uk',
}: {
  order: AdminOrder;
  ordersUrl: string;
  fetcher: FetchImpl;
  onSaved: (message: string) => void;
  locale?: AdminLocale;
}) {
  const t = (key: string): string => ADMIN_STRINGS[locale][key] ?? key;
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
      if (res.ok) onSaved(t('admin_saved'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td>{order.number}</td>
      <td>
        <label htmlFor={`admin-order-status-${order.number}`}>{t('admin_status_label').replace('{number}', order.number)}</label>
        <select id={`admin-order-status-${order.number}`} aria-label={t('admin_status_label').replace('{number}', order.number)} value={status} onChange={(e) => setStatus(e.target.value)}>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label htmlFor={`admin-order-ttn-${order.number}`}>{t('admin_ttn_label').replace('{number}', order.number)}</label>
        <input id={`admin-order-ttn-${order.number}`} aria-label={t('admin_ttn_label').replace('{number}', order.number)} value={ttn} onChange={(e) => setTtn(e.target.value)} />
      </td>
      <td>
        <button type="button" disabled={saving} onClick={() => void save()}>
          {t('admin_save')}
        </button>
      </td>
    </tr>
  );
}

function ProductForm({
  productsUrl,
  fetcher,
  onSaved,
  locale = 'uk',
}: {
  productsUrl: string;
  fetcher: FetchImpl;
  onSaved: (message: string) => void;
  locale?: AdminLocale;
}) {
  const t = (key: string): string => ADMIN_STRINGS[locale][key] ?? key;
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
      onSaved(t('admin_saved'));
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
    <form aria-label={t('admin_new_product')} onSubmit={(e) => void create(e)}>
      <label htmlFor="admin-p-name">{t('admin_f_name')}</label>
      <input id="admin-p-name" aria-label={t('admin_f_name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      <label htmlFor="admin-p-brand">{t('admin_f_brand')}</label>
      <input id="admin-p-brand" aria-label={t('admin_f_brand')} value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={200} />
      <label htmlFor="admin-p-price">{t('admin_f_price')}</label>
      <input id="admin-p-price" aria-label={t('admin_f_price')} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" />
      <label htmlFor="admin-p-old-price">{t('admin_f_old_price')}</label>
      <input id="admin-p-old-price" aria-label={t('admin_f_old_price')} value={oldPrice} onChange={(e) => setOldPrice(e.target.value)} inputMode="numeric" />
      <label htmlFor="admin-p-stock">{t('admin_f_stock')}</label>
      <input id="admin-p-stock" aria-label={t('admin_f_stock')} value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" />
      <label htmlFor="admin-p-volume">{t('admin_f_volume')}</label>
      <select id="admin-p-volume" aria-label={t('admin_f_volume')} value={volume} onChange={(e) => setVolume(e.target.value)}>
        {ALLOWED_VOLUMES.map((v) => (
          <option key={v} value={String(v)}>
            {v} мл
          </option>
        ))}
      </select>
      <label htmlFor="admin-p-photo">{t('admin_f_photo')}</label>
      <input id="admin-p-photo" aria-label={t('admin_f_photo')} value={photo} onChange={(e) => setPhoto(e.target.value)} maxLength={300} />
      <label htmlFor="admin-p-hit">
        <input id="admin-p-hit" type="checkbox" checked={isHit} onChange={(e) => setIsHit(e.target.checked)} />
        {t('admin_hit')}
      </label>
      <button type="submit">{t('admin_add_product')}</button>
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
  locale = 'uk',
}: AdminProps) {
  const t = (key: string): string => ADMIN_STRINGS[locale][key] ?? key;
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
      <section className="fd-admin" aria-label={t('admin_title')}>
        <Skeleton height={120} label={t('loading')} locale={locale} />
      </section>
    );
  }

  if (gate === 'denied') {
    return (
      <section className="fd-admin" aria-label={t('admin_title')}>
        <h1>{t('admin_denied')}</h1>
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
    if (res.ok) notify(t('admin_saved'));
  };

  const savePromo = async () => {
    const res = await fetcher(promosUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id: Number(promoId), is_active: promoActive }),
    });
    if (res.ok) notify(t('admin_saved'));
  };

  return (
    <section className="fd-admin" aria-label={t('admin_title')}>
      <h1>{t('admin_title')}</h1>
      <div role="tablist" aria-label={t('admin_sections')}>
        {(['products', 'orders', 'settings'] as Section[]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)}>
            {s === 'products' ? t('admin_products_tab') : s === 'orders' ? t('admin_orders_tab') : t('admin_settings_tab')}
          </button>
        ))}
      </div>
      {loading ? (
        <Skeleton height={120} label={t('loading')} locale={locale} />
      ) : (
        <>
          {section === 'products' && (
            <div>
              <ProductForm productsUrl={productsUrl} fetcher={fetcher} onSaved={notify} locale={locale} />
              <table aria-label={t('admin_products_table')}>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.variants.map((v) => `${v.volume_ml}мл:${v.stock}`).join(', ')}</td>
                      <td>{p.is_hit ? t('admin_hit_badge') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {section === 'orders' && (
            <table aria-label={t('admin_orders_tab')}>
              <tbody>
                {orders.map((o) => (
                  <OrderRow key={o.number} order={o} ordersUrl={ordersUrl} fetcher={fetcher} onSaved={notify} locale={locale} />
                ))}
              </tbody>
            </table>
          )}
          {section === 'settings' && settings && (
            <div>
              <form aria-label={t('admin_settings_tab')} onSubmit={(e) => void saveSettings(e)}>
                <label htmlFor="admin-s-city">{t('admin_city')}</label>
                <input id="admin-s-city" aria-label={t('admin_city')} value={dispatchCity} onChange={(e) => setDispatchCity(e.target.value)} />
                <label htmlFor="admin-s-requisites">{t('admin_requisites')}</label>
                <textarea id="admin-s-requisites" aria-label={t('admin_requisites')} value={cardRequisites} onChange={(e) => setCardRequisites(e.target.value)} />
                <label htmlFor="admin-s-provider">{t('admin_provider_key')}</label>
                <input id="admin-s-provider" aria-label={t('admin_provider_key')} value={providerKey} onChange={(e) => setProviderKey(e.target.value)} />
                <label htmlFor="admin-s-usernames">{t('admin_usernames')}</label>
                <textarea
                  id="admin-s-usernames"
                  aria-label={t('admin_usernames')}
                  value={usernamesText}
                  onChange={(e) => setUsernamesText(e.target.value)}
                />
                <button type="submit">{t('admin_save_settings')}</button>
              </form>
              <form aria-label={t('admin_promo')} onSubmit={(e) => { e.preventDefault(); void savePromo(); }}>
                <label htmlFor="admin-promo-id">{t('admin_promo_id')}</label>
                <input id="admin-promo-id" aria-label={t('admin_promo_id')} value={promoId} onChange={(e) => setPromoId(e.target.value)} inputMode="numeric" />
                <label htmlFor="admin-promo-active">
                  <input id="admin-promo-active" type="checkbox" checked={promoActive} onChange={(e) => setPromoActive(e.target.checked)} />
                  {t('admin_promo_active')}
                </label>
                <button type="submit">{t('admin_save_promo')}</button>
              </form>
            </div>
          )}
        </>
      )}
      {toast && <Toast message={toast} kind="success" />}
    </section>
  );
}

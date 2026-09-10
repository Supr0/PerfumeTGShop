/**
 * Orders page: buyer order history from GET /v1/orders/mine
 * (initData attached via tma authHeaders). Display-only totals —
 * the server is the source of truth for prices.
 */
import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from '../components/feedback';
import { fetchCatalog } from '../lib/api';
import { authHeaders } from '../lib/tma';
import type { FetchImpl } from './Checkout';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';

export type OrdersLocale = 'uk' | 'ru';

const ORDERS_STRINGS: Record<OrdersLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

export const ORDERS_URL = '/v1/orders/mine';

/** Module-level stable default so the prod path (no fetchImpl) keeps fetcher identity. */
const defaultFetch: FetchImpl = (input, init) => fetch(input, init);

// TODO: resolve the seller username from GET /settings/public — Wave: wire to API.
export const SELLER_HREF = 'https://t.me/freshdoze_catalog_bot';

export interface MineOrderItem {
  variant_id: number;
  qty: number;
  price_minor_uah: number;
}

export interface MineOrder {
  number: string;
  status: string;
  ttn?: string | null;
  items: MineOrderItem[];
  total_minor_uah?: number | null;
  total?: number | null;
  created?: string;
}

/** Display-only total in major units: explicit server total wins, else line sum. */
export function orderTotalMajor(order: MineOrder): number {
  const explicit =
    typeof order.total_minor_uah === 'number'
      ? order.total_minor_uah
      : typeof order.total === 'number'
        ? order.total
        : null;
  if (explicit !== null) return explicit / 100;
  return order.items.reduce((sum, line) => sum + line.price_minor_uah * line.qty, 0) / 100;
}

/** Display-only variant lookup: variant_id → product name + volume. */
export interface VariantLabel {
  name: string;
  volumeMl: number;
}

/** Build the variant map from one catalog page (display mapping only). */
export function variantLabelsOf(items: Array<{ name: string; variants: Array<{ id: number; volume_ml: number }> }>): Map<number, VariantLabel> {
  const map = new Map<number, VariantLabel>();
  for (const product of items) {
    for (const variant of product.variants) {
      map.set(variant.id, { name: product.name, volumeMl: variant.volume_ml });
    }
  }
  return map;
}

/** One order line: resolved "Name · 3 мл × qty · line total" or the bare variant fallback. */
export function orderLineLabel(line: MineOrderItem, labels: Map<number, VariantLabel>, locale: OrdersLocale = 'uk'): string {
  const t = (key: string): string => ORDERS_STRINGS[locale][key] ?? key;
  const hit = labels.get(line.variant_id);
  if (!hit) return t('order_variant_fallback').replace('{id}', String(line.variant_id)).replace('{qty}', String(line.qty));
  return `${hit.name} · ${hit.volumeMl} мл × ${line.qty} · ${(line.price_minor_uah * line.qty) / 100} ₴`;
}

interface OrdersProps {
  fetchImpl?: FetchImpl;
  listUrl?: string;
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: OrdersLocale;
}

export default function Orders({ fetchImpl, listUrl = ORDERS_URL, locale = 'uk' }: OrdersProps) {
  const t = (key: string): string => ORDERS_STRINGS[locale][key] ?? key;
  const fetcher: FetchImpl = fetchImpl ?? defaultFetch;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [orders, setOrders] = useState<MineOrder[]>([]);
  const [labels, setLabels] = useState<Map<number, VariantLabel>>(new Map());
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetcher(listUrl, { headers: { ...authHeaders() } });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const payload: unknown = await res.json().catch(() => null);
      const list: MineOrder[] = Array.isArray(payload) ? (payload as MineOrder[]) : [];
      setOrders(list);
      // ONE catalog lookup for display names; failure keeps the bare fallback labels.
      try {
        const page = await fetchCatalog(undefined, fetcher);
        setLabels(variantLabelsOf(page.items));
      } catch {
        setLabels(new Map());
      }
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [fetcher, listUrl]);

  useEffect(() => {
    void load();
  }, [load, attempt]);

  if (status === 'loading') {
    return (
      <section className="fd-orders" aria-label={t('orders_title')}>
        <h1>{t('orders_title')}</h1>
        <div aria-label={t('orders_loading')}>
          <Skeleton height={72} label={t('loading')} locale={locale} />
          <Skeleton height={72} label={t('loading')} locale={locale} />
        </div>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="fd-orders" aria-label={t('orders_title')}>
        <h1>{t('orders_title')}</h1>
        <p role="alert">{t('orders_load_error')}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          {t('retry')}
        </button>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section className="fd-orders" aria-label={t('orders_title')}>
        <h1>{t('orders_title')}</h1>
        <p>{t('orders_empty')}</p>
        <a href="#/">{t('orders_to_catalog')}</a>
      </section>
    );
  }

  return (
    <section className="fd-orders" aria-label={t('orders_title')}>
      <h1>{t('orders_title')}</h1>
      <ul>
        {orders.map((order) => (
          <li key={order.number}>
            <article aria-label={t('order_title').replace('{number}', order.number)}>
              <h2>{t('order_title').replace('{number}', order.number)}</h2>
              <p>{t('order_status').replace('{status}', order.status)}</p>
              {order.ttn ? <p>{t('order_ttn').replace('{ttn}', order.ttn)}</p> : null}
              <p>{t('order_total').replace('{total}', String(orderTotalMajor(order)))}</p>
              <ul>
                {order.items.map((line) => (
                  <li key={line.variant_id}>{orderLineLabel(line, labels, locale)}</li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ul>
      <a href={SELLER_HREF} target="_blank" rel="noreferrer">
        {t('seller_chat')}
      </a>
    </section>
  );
}

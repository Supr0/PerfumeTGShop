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
export function orderLineLabel(line: MineOrderItem, labels: Map<number, VariantLabel>): string {
  const hit = labels.get(line.variant_id);
  if (!hit) return `Варіант ${line.variant_id} × ${line.qty}`;
  return `${hit.name} · ${hit.volumeMl} мл × ${line.qty} · ${(line.price_minor_uah * line.qty) / 100} ₴`;
}

interface OrdersProps {
  fetchImpl?: FetchImpl;
  listUrl?: string;
}

export default function Orders({ fetchImpl, listUrl = ORDERS_URL }: OrdersProps) {
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
      <section aria-label="Замовлення">
        <h1>Замовлення</h1>
        <div aria-label="Завантаження замовлень">
          <Skeleton height={72} label="Завантаження…" />
          <Skeleton height={72} label="Завантаження…" />
        </div>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section aria-label="Замовлення">
        <h1>Замовлення</h1>
        <p role="alert">Не вдалося завантажити замовлення.</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          Спробувати ще
        </button>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section aria-label="Замовлення">
        <h1>Замовлення</h1>
        <p>Замовлень поки немає</p>
        <a href="#/">До каталогу</a>
      </section>
    );
  }

  return (
    <section aria-label="Замовлення">
      <h1>Замовлення</h1>
      <ul>
        {orders.map((order) => (
          <li key={order.number}>
            <article aria-label={`Замовлення №${order.number}`}>
              <h2>{`Замовлення №${order.number}`}</h2>
              <p>{`Статус: ${order.status}`}</p>
              {order.ttn ? <p>{`ТТН: ${order.ttn}`}</p> : null}
              <p>{`Разом: ${orderTotalMajor(order)} ₴`}</p>
              <ul>
                {order.items.map((line) => (
                  <li key={line.variant_id}>{orderLineLabel(line, labels)}</li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ul>
      <a href={SELLER_HREF} target="_blank" rel="noreferrer">
        Написати продавцю
      </a>
    </section>
  );
}

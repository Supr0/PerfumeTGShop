/**
 * Orders page: buyer order history from GET /v1/orders/mine
 * (initData attached via tma authHeaders). Display-only totals —
 * the server is the source of truth for prices.
 */
import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from '../components/feedback';
import { authHeaders } from '../lib/tma';
import type { FetchImpl } from './Checkout';

export const ORDERS_URL = '/v1/orders/mine';

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

interface OrdersProps {
  fetchImpl?: FetchImpl;
  listUrl?: string;
}

export default function Orders({ fetchImpl, listUrl = ORDERS_URL }: OrdersProps) {
  const fetcher: FetchImpl =
    fetchImpl ?? ((input, init) => fetch(input, init));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [orders, setOrders] = useState<MineOrder[]>([]);
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
      setOrders(Array.isArray(payload) ? (payload as MineOrder[]) : []);
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
        <a href="/">До каталогу</a>
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
                  <li key={line.variant_id}>{`Варіант ${line.variant_id} × ${line.qty}`}</li>
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

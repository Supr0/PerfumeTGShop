import { useEffect, useState } from 'react';
import {
  MAX_QTY,
  cartTotal,
  loadCart,
  persistCart,
  removeItem,
  switchVolume,
  updateQty,
  type CartItem,
  type CartState,
} from '../lib/cart';

interface CartPageProps {
  /** Stock lookup per line; defaults to unconstrained (store never fetches). */
  resolveStock?: (item: CartItem) => number;
  /** Available volumes (ml numbers) per product; defaults to the line's own volume. */
  volumesByProduct?: Record<string, number[]>;
  /** Stock lookup for a volume switch target. */
  resolveVolumeStock?: (productId: string, volumeMl: number) => number;
  /** Variant id lookup for a volume switch target (checkout FK). */
  resolveVariantId?: (productId: string, volumeMl: number) => number;
}

/**
 * Cart page: lines with volume/qty controls, delete, display-only total,
 * and a checkout link (real totals are recomputed server-side at checkout).
 */
export default function Cart({
  resolveStock = () => MAX_QTY,
  volumesByProduct = {},
  resolveVolumeStock = () => MAX_QTY,
  resolveVariantId = () => 0,
}: CartPageProps) {
  const [lines, setLines] = useState<CartState>(() => loadCart());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    persistCart(lines);
  }, [lines]);

  if (lines.length === 0) {
    return (
      <section aria-label="Корзина">
        <h1>Корзина</h1>
        <p>Корзина пуста</p>
        <a href="/">Смотреть хиты</a>
      </section>
    );
  }

  const changeQty = (item: CartItem, delta: number) => {
    setNotice(null);
    setLines((prev) => updateQty(prev, item.productId, item.volume_ml, item.qty + delta, resolveStock(item)));
  };

  const changeVolume = (item: CartItem, nextVolumeMl: number) => {
    if (nextVolumeMl === item.volume_ml) return;
    const result = switchVolume(
      lines,
      item.productId,
      item.volume_ml,
      nextVolumeMl,
      resolveVolumeStock(item.productId, nextVolumeMl),
      resolveVariantId(item.productId, nextVolumeMl),
    );
    if (result.ok) {
      setNotice(null);
      setLines(result.state);
    } else {
      setNotice(result.reason === 'out_of_stock' ? 'Нет в наличии' : 'Товар не найден в корзине');
    }
  };

  return (
    <section aria-label="Корзина">
      <h1>Корзина</h1>
      {notice && (
        <p role="alert">{notice}</p>
      )}
      <ul>
        {lines.map((line) => {
          const volumes = volumesByProduct[line.productId] ?? [line.volume_ml];
          return (
            <li key={`${line.productId}::${line.volume_ml}`}>
              <span>{line.name ?? line.productId}</span>
              <span>{line.volume_ml} ml</span>
              {volumes.length > 1 ? (
                <select
                  aria-label={`Объём для ${line.name ?? line.productId}`}
                  value={line.volume_ml}
                  onChange={(e) => changeVolume(line, Number(e.target.value))}
                >
                  {volumes.map((v) => (
                    <option key={v} value={v}>
                      {v} ml
                    </option>
                  ))}
                </select>
              ) : null}
              <div>
                <button type="button" aria-label={`Уменьшить ${line.name ?? line.productId}`} onClick={() => changeQty(line, -1)}>
                  −
                </button>
                <span aria-label="Количество">{line.qty}</span>
                <button type="button" aria-label={`Увеличить ${line.name ?? line.productId}`} onClick={() => changeQty(line, 1)}>
                  +
                </button>
              </div>
              <span>
                {line.price * line.qty} ₴
              </span>
              <button
                type="button"
                aria-label={`Удалить ${line.name ?? line.productId}`}
                onClick={() => setLines((prev) => removeItem(prev, line.productId, line.volume_ml))}
              >
                Удалить
              </button>
            </li>
          );
        })}
      </ul>
      <p>
        Итого: {cartTotal(lines)} ₴
      </p>
      <a href="/checkout">К оформлению</a>
    </section>
  );
}

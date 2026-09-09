import { useEffect, useState } from 'react';
import { EmptyState } from '../components/feedback';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';
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
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: CartLocale;
}

export type CartLocale = 'uk' | 'ru';

const CART_STRINGS: Record<CartLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

/**
 * Cart page: lines with volume/qty controls, delete, display-only total,
 * and a checkout link (real totals are recomputed server-side at checkout).
 */
export default function Cart({
  resolveStock = () => MAX_QTY,
  volumesByProduct = {},
  resolveVolumeStock = () => MAX_QTY,
  resolveVariantId = () => 0,
  locale = 'uk',
}: CartPageProps) {
  const t = (key: string): string => CART_STRINGS[locale][key] ?? key;
  const labelFor = (key: string, name: string): string => t(key).replace('{name}', name);
  const [lines, setLines] = useState<CartState>(() => loadCart());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    persistCart(lines);
  }, [lines]);

  if (lines.length === 0) {
    return (
      <section className="fd-cart" aria-label={t('cart_title')}>
        <h1>{t('cart_title')}</h1>
        <EmptyState title={t('cart_empty')} action={<a href="#/">{t('cart_browse_hits')}</a>} />
      </section>
    );
  }

  const changeQty = (item: CartItem, delta: number) => {
    setNotice(null);
    setLines((prev) => updateQty(prev, item.productId, item.volume_ml, item.qty + delta, resolveStock(item)));
  };

  const changeVolume = (item: CartItem, nextVolumeMl: number) => {
    if (nextVolumeMl === item.volume_ml) return;
    const targetStock = resolveVolumeStock(item.productId, nextVolumeMl);
    const targetVariantId = resolveVariantId(item.productId, nextVolumeMl);
    setLines((prev) => {
      const result = switchVolume(
        prev,
        item.productId,
        item.volume_ml,
        nextVolumeMl,
        targetStock,
        targetVariantId,
      );
      if (result.ok) {
        setNotice(null);
      } else if (result.reason === 'already_in_cart') {
        setNotice(t('cart_already_in_cart'));
      } else {
        setNotice(result.reason === 'out_of_stock' ? t('cart_oos') : t('cart_not_in_cart'));
      }
      return result.state;
    });
  };

  const removeLine = (item: CartItem) => {
    setNotice(null);
    setLines((prev) => removeItem(prev, item.productId, item.volume_ml));
  };

  return (
    <section className="fd-cart" aria-label={t('cart_title')}>
      <h1>{t('cart_title')}</h1>
      {notice && (
        <p role="alert">{notice}</p>
      )}
      <ul>
        {lines.map((line) => {
          const allVolumes = volumesByProduct[line.productId] ?? [line.volume_ml];
          // Out-of-stock volumes are hidden, but the current line volume
          // always stays (mirrors the VolumeSelector hideOutOfStock contract).
          const volumes = allVolumes.filter(
            (v) => v === line.volume_ml || resolveVolumeStock(line.productId, v) > 0,
          );
          return (
            <li key={`${line.productId}::${line.volume_ml}`}>
              <span>{line.name ?? line.productId}</span>
              <span>{line.volume_ml} ml</span>
              {allVolumes.length > 1 ? (
                <select
                  aria-label={labelFor('cart_volume_label', line.name ?? line.productId)}
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
                <button type="button" aria-label={labelFor('cart_decrease_label', line.name ?? line.productId)} onClick={() => changeQty(line, -1)}>
                  −
                </button>
                <span aria-label={t('cart_qty')}>{line.qty}</span>
                <button type="button" aria-label={labelFor('cart_increase_label', line.name ?? line.productId)} onClick={() => changeQty(line, 1)}>
                  +
                </button>
              </div>
              <span>
                {line.price * line.qty} ₴
              </span>
              <button
                type="button"
                className="fd-cart__remove"
                aria-label={labelFor('cart_remove_label', line.name ?? line.productId)}
                onClick={() => removeLine(line)}
              >
                {t('cart_remove')}
              </button>
            </li>
          );
        })}
      </ul>
      <p>
        {t('cart_total')}: {cartTotal(lines)} ₴
      </p>
      <a href="#/checkout">{t('cart_to_checkout')}</a>
    </section>
  );
}

/**
 * ProductCard — grid card for a catalog product.
 *
 * Field names mirror `apps/api/schemas/catalog.py` exactly
 * (ProductOut / VariantOut): season is a string array, notes are
 * plain strings (comma-joined by the API). Characteristics are NOT
 * a field — the Product page builds them from real ProductOut
 * fields (family, gender, season, longevity, sillage, place_tags).
 */

import { useState } from 'react';
import { VolumeSheet } from './VolumeSheet';

export interface VariantOut {
  id: number;
  volume_ml: number;
  price_minor_uah: number;
  old_price_minor_uah: number | null;
  stock: number;
}

export interface Product {
  id: number;
  name: string;
  brand?: string | null;
  description?: string | null;
  variants: VariantOut[];
  family?: string | null;
  gender?: string | null;
  season?: string[] | null;
  notes_top?: string | string[] | null;
  notes_heart?: string | string[] | null;
  notes_base?: string | string[] | null;
  longevity?: number | null;
  sillage?: number | null;
  place_tags?: string[] | null;
  is_hit?: boolean;
}

export interface AddToCartHandler {
  (productId: number, variantId: number): void;
}

const DEFAULT_CURRENCY = '₴';
const OOS_LABEL = 'Немає в наявності';

/** Minor units (kopiyky) → whole major units, e.g. 39000 → "390". */
export function formatPriceMinor(priceMinorUah: number): string {
  const major = priceMinorUah / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

/** Discount percent of a variant, or null when there is no old price. */
export function discountPercent(variant: VariantOut): number | null {
  const old = variant.old_price_minor_uah;
  if (old == null || old <= 0 || old <= variant.price_minor_uah) return null;
  return Math.round((1 - variant.price_minor_uah / old) * 100);
}

export function isOutOfStock(variant: VariantOut): boolean {
  return variant.stock <= 0;
}

/** Cheapest variant price, used for sorting. Missing → +Infinity. */
export function minVariantPrice(product: Product): number {
  if (product.variants.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...product.variants.map((v) => v.price_minor_uah));
}

export function hasInStockVariant(product: Product): boolean {
  return product.variants.some((v) => !isOutOfStock(v));
}

interface ProductCardProps {
  product: Product;
  currency?: string;
  isFavorite?: boolean;
  onAdd?: AddToCartHandler;
  onToggleFavorite?: (productId: number) => void;
  /** UI locale — passed through to the volume sheet; defaults to UK. */
  locale?: ProductCardLocale;
}

export type ProductCardLocale = 'uk' | 'ru';

export function ProductCard({
  product,
  currency = DEFAULT_CURRENCY,
  isFavorite = false,
  onAdd,
  onToggleFavorite,
  locale = 'uk',
}: ProductCardProps) {
  const volumes = [...product.variants].sort((a, b) => a.volume_ml - b.volume_ml);
  const firstInStock = volumes.find((v) => !isOutOfStock(v)) ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleAdd = () => {
    if (!firstInStock) return;
    setSheetOpen(true);
  };

  const handlePick = (productId: number, variantId: number) => {
    onAdd?.(productId, variantId);
    setSheetOpen(false);
  };

  return (
    <article className="fd-product-card" aria-label={product.name}>
      <div className="fd-product-card__image" role="img" aria-label={product.name} />
      <div className="fd-product-card__badges">
        {product.is_hit && <span className="fd-badge fd-badge--hit">HIT</span>}
        {volumes.map((v) => {
          const pct = discountPercent(v);
          return pct != null ? (
            <span key={v.id} className="fd-badge fd-badge--sale">
              -{pct}%
            </span>
          ) : null;
        })}
      </div>
      {product.brand && <p className="fd-product-card__brand">{product.brand}</p>}
      <h3 className="fd-product-card__name">{product.name}</h3>
      <ul className="fd-product-card__prices">
        {volumes.map((v) => (
          <li key={v.id} className="fd-product-card__price-row">
            <span>
              {v.volume_ml} ml — {formatPriceMinor(v.price_minor_uah)} {currency}
            </span>
            {isOutOfStock(v) && <span className="fd-badge fd-badge--oos">{OOS_LABEL}</span>}
          </li>
        ))}
      </ul>
      <div className="fd-product-card__actions">
        <button
          type="button"
          onClick={handleAdd}
          disabled={firstInStock == null}
          aria-label={`Додати ${product.name}`}
        >
          Додати +
        </button>
        <button
          type="button"
          aria-pressed={isFavorite}
          aria-label={`Обране: ${product.name}`}
          onClick={() => onToggleFavorite?.(product.id)}
        >
          {isFavorite ? '♥' : '♡'}
        </button>
      </div>
      {sheetOpen && firstInStock && (
        <VolumeSheet
          product={product}
          currency={currency}
          locale={locale}
          onPick={handlePick}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </article>
  );
}

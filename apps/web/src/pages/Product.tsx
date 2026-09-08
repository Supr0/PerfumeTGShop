/**
 * ProductPage — product details: gallery placeholder, volume selector
 * with live price, description, notes pyramid, characteristics table,
 * Similar STUB section (Wave 4 fills it with real recommendations).
 */
import { useState } from 'react';
import { VolumeSelector } from '../components/VolumeSelector';
import { isOutOfStock } from '../components/ProductCard';
import type { Product, AddToCartHandler } from '../components/ProductCard';
import { Skeleton, Toast } from '../components/feedback';

const ADDED_LABEL = 'Додано до кошика';

/**
 * Notes arrive from the API as comma-joined strings; arrays are accepted
 * for fixture convenience. A bare string without a separator is one note.
 */
export function toNoteItems(value: string | string[] | null | undefined): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  const parts = value.split(', ').map((s) => s.trim()).filter((s) => s !== '');
  return parts.length > 0 ? parts : null;
}

/** Characteristics table built from real ProductOut fields — no fixture-only object. */
export function characteristicsOf(product: Product): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (product.family) rows.push(['Сімейство', product.family]);
  if (product.gender) rows.push(['Стать', product.gender]);
  if (product.season && product.season.length > 0) rows.push(['Сезон', product.season.join(', ')]);
  if (product.longevity != null) rows.push(['Стійкість', String(product.longevity)]);
  if (product.sillage != null) rows.push(['Шлейф', String(product.sillage)]);
  if (product.place_tags && product.place_tags.length > 0)
    rows.push(['Нагоди', product.place_tags.join(', ')]);
  return rows;
}

function defaultVolume(product: Product): number {
  const inStock = product.variants.find((v) => !isOutOfStock(v));
  return (inStock ?? product.variants[0])?.volume_ml ?? 3;
}

interface ProductPageProps {
  product?: Product | null;
  loading?: boolean;
  onAddToCart?: AddToCartHandler;
}

export function ProductPage({ product = null, loading = false, onAddToCart }: ProductPageProps) {
  const [volume, setVolume] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (loading || product == null) {
    return (
      <section className="fd-product" aria-label="Товар">
        <Skeleton height={240} label="Завантаження товару…" />
        <Skeleton height={24} />
        <Skeleton height={16} />
      </section>
    );
  }

  const activeVolume = volume ?? defaultVolume(product);
  const activeVariant =
    product.variants.find((v) => v.volume_ml === activeVolume) ?? product.variants[0] ?? null;

  const handleAdd = () => {
    if (!activeVariant || isOutOfStock(activeVariant)) return;
    onAddToCart?.(product.id, activeVariant.id);
    setToast(ADDED_LABEL);
  };

  const notes = [
    { title: 'Верхні ноти', items: toNoteItems(product.notes_top) },
    { title: 'Ноти серця', items: toNoteItems(product.notes_heart) },
    { title: 'База', items: toNoteItems(product.notes_base) },
  ].filter((g): g is { title: string; items: string[] } => g.items != null && g.items.length > 0);

  const characteristics = characteristicsOf(product);

  return (
    <section className="fd-product" aria-label={product.name}>
      <div className="fd-product__gallery" role="img" aria-label={product.name} />
      {product.brand && <p className="fd-product__brand">{product.brand}</p>}
      <h1 className="fd-product__name">{product.name}</h1>
      <VolumeSelector variants={product.variants} value={activeVolume} onChange={setVolume} />
      <button
        type="button"
        onClick={handleAdd}
        disabled={activeVariant == null || isOutOfStock(activeVariant)}
        aria-label={`Додати ${product.name}`}
      >
        Додати +
      </button>
      {product.description && <p className="fd-product__description">{product.description}</p>}
      {notes.length > 0 && (
        <section aria-label="Піраміда аромату">
          <h2>Піраміда аромату</h2>
          {notes.map((g) => (
            <div key={g.title}>
              <h3>{g.title}</h3>
              <ul>
                {g.items.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {characteristics.length > 0 && (
        <section aria-label="Характеристики">
          <h2>Характеристики</h2>
          <table>
            <tbody>
              {characteristics.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section aria-label="Схожі товари (Similar)">
        <h2>Схожі товари (Similar)</h2>
        <p role="status">Скоро — рекомендації вже в дорозі.</p>
      </section>
      {toast && <Toast message={toast} kind="success" />}
    </section>
  );
}

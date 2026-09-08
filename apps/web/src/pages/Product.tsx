/**
 * ProductPage — product details: gallery placeholder, volume selector
 * with live price, description, notes pyramid, characteristics table,
 * Similar recommendations from the catalog API.
 *
 * Detail is fetched by id; a preloaded `product` prop skips the fetch
 * (test seam). Similar = same-brand catalog fetch (family fallback,
 * limit 8, self excluded) with a graceful empty.
 */
import { useEffect, useState } from 'react';
import { fetchCatalog, fetchProduct, type FetchFn } from '../lib/api';
import { VolumeSelector } from '../components/VolumeSelector';
import { isOutOfStock } from '../components/ProductCard';
import type { Product, AddToCartHandler } from '../components/ProductCard';
import { ADDED_TO_CART_LABEL, Skeleton, Toast } from '../components/feedback';

const LOAD_ERROR_LABEL = 'Не вдалося завантажити товар.';
const RETRY_LABEL = 'Спробувати ще';
const SIMILAR_EMPTY_LABEL = 'Поки немає схожих товарів.';
const SIMILAR_LIMIT = 8;

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
  productId?: number;
  /** Preloaded product — skips the detail fetch (test seam). */
  product?: Product | null;
  loading?: boolean;
  onAddToCart?: AddToCartHandler;
  /** Test seam — defaults to the global fetch. */
  fetchImpl?: FetchFn;
}

export function ProductPage({ productId, product: productProp, loading = false, onAddToCart, fetchImpl }: ProductPageProps) {
  const [volume, setVolume] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fetched, setFetched] = useState<Product | null>(null);
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    productProp !== undefined ? 'idle' : 'loading',
  );
  const [attempt, setAttempt] = useState(0);
  const [similar, setSimilar] = useState<Product[]>([]);

  useEffect(() => {
    if (productProp !== undefined || productId == null) return;
    let cancelled = false;
    setDetailStatus('loading');
    void fetchProduct(productId, fetchImpl ?? ((input, init) => fetch(input, init))).then(
      (p) => {
        if (cancelled) return;
        setFetched(p);
        setDetailStatus('ready');
      },
      () => {
        if (!cancelled) setDetailStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [productProp, productId, attempt, fetchImpl]);

  const product = productProp ?? fetched;

  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    const fetcher: FetchFn = fetchImpl ?? ((input, init) => fetch(input, init));
    void (async () => {
      const excludeSelf = (items: Product[]) => items.filter((p) => p.id !== product.id).slice(0, SIMILAR_LIMIT);
      if (product.brand) {
        const brandParams = new URLSearchParams({ limit: String(SIMILAR_LIMIT) });
        brandParams.append('brand', product.brand);
        try {
          const page = await fetchCatalog(brandParams, fetcher);
          const matches = excludeSelf(page.items);
          if (!cancelled && matches.length > 0) {
            setSimilar(matches);
            return;
          }
        } catch {
          // Brand fetch failed — family fallback still gets a chance.
        }
      }
      if (product.family) {
        const familyParams = new URLSearchParams({ limit: String(SIMILAR_LIMIT) });
        familyParams.append('family', product.family);
        try {
          const page = await fetchCatalog(familyParams, fetcher);
          if (!cancelled) setSimilar(excludeSelf(page.items));
        } catch {
          if (!cancelled) setSimilar([]);
        }
      } else if (!cancelled) {
        setSimilar([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product, fetchImpl]);

  if (loading || product == null) {
    if (detailStatus === 'error' && productId != null) {
      return (
        <section className="fd-product" aria-label="Товар">
          <p role="alert">{LOAD_ERROR_LABEL}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            {RETRY_LABEL}
          </button>
        </section>
      );
    }
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
    setToast(ADDED_TO_CART_LABEL);
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
      <section aria-label="Схожі товари">
        <h2>Схожі товари</h2>
        {similar.length === 0 ? (
          <p role="status">{SIMILAR_EMPTY_LABEL}</p>
        ) : (
          <ul>
            {similar.map((s) => (
              <li key={s.id}>
                <a href={`#/product/${s.id}`}>{s.name}</a>
              </li>
            ))}
          </ul>
        )}
      </section>
      {toast && <Toast message={toast} kind="success" />}
    </section>
  );
}

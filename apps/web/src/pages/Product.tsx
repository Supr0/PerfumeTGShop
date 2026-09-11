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
import { addItem, loadCart, persistCart } from '../lib/cart';
import { VolumeSelector } from '../components/VolumeSelector';
import { isOutOfStock } from '../components/ProductCard';
import type { Product, AddToCartHandler } from '../components/ProductCard';
import { Skeleton, Toast } from '../components/feedback';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';

export type ProductPageLocale = 'uk' | 'ru';

const PRODUCT_STRINGS: Record<ProductPageLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

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
export function characteristicsOf(product: Product, locale: ProductPageLocale = 'uk'): Array<[string, string]> {
  const t = (key: string): string => PRODUCT_STRINGS[locale][key] ?? key;
  const rows: Array<[string, string]> = [];
  if (product.family) rows.push([t('char_family'), product.family]);
  if (product.gender) rows.push([t('char_gender'), product.gender]);
  if (product.season && product.season.length > 0) rows.push([t('char_season'), product.season.join(', ')]);
  if (product.longevity != null) rows.push([t('char_longevity'), String(product.longevity)]);
  if (product.sillage != null) rows.push([t('char_sillage'), String(product.sillage)]);
  if (product.place_tags && product.place_tags.length > 0)
    rows.push([t('char_occasions'), product.place_tags.join(', ')]);
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
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: ProductPageLocale;
}

export function ProductPage({ productId, product: productProp, loading = false, onAddToCart, fetchImpl, locale = 'uk' }: ProductPageProps) {
  const t = (key: string): string => PRODUCT_STRINGS[locale][key] ?? key;
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
        <section className="fd-product" aria-label={t('product_section')}>
          <p role="alert">{t('product_load_error')}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            {t('retry')}
          </button>
        </section>
      );
    }
    return (
      <section className="fd-product" aria-label={t('product_section')}>
        <Skeleton height={240} label={t('product_loading')} locale={locale} />
        <Skeleton height={24} locale={locale} />
        <Skeleton height={16} locale={locale} />
      </section>
    );
  }

  const activeVolume = volume ?? defaultVolume(product);
  const activeVariant =
    product.variants.find((v) => v.volume_ml === activeVolume) ?? product.variants[0] ?? null;

  const handleAdd = () => {
    // Same add semantics as Home.handleAdd — keep in sync: addItem is a
    // no-op when stock is 0 and persistCart can fail when storage is
    // unavailable, so only claim success when the line actually landed.
    // Toasting unconditionally masked failed adds (tap → toast → empty cart).
    let added = false;
    if (activeVariant && activeVariant.stock > 0) {
      const next = addItem(
        loadCart(),
        {
          productId: String(product.id),
          variantId: activeVariant.id,
          volume_ml: activeVariant.volume_ml,
          qty: 1,
          price: activeVariant.price_minor_uah / 100,
          name: product.name,
        },
        activeVariant.stock,
      );
      added = persistCart(next);
    }
    if (activeVariant) onAddToCart?.(product.id, activeVariant.id);
    setToast(t(added ? 'added_to_cart' : 'add_failed'));
  };

  const notes = [
    { title: t('notes_top'), items: toNoteItems(product.notes_top) },
    { title: t('notes_heart'), items: toNoteItems(product.notes_heart) },
    { title: t('notes_base'), items: toNoteItems(product.notes_base) },
  ].filter((g): g is { title: string; items: string[] } => g.items != null && g.items.length > 0);

  const characteristics = characteristicsOf(product, locale);

  return (
    <section className="fd-product" aria-label={product.name}>
      <div className="fd-product__gallery" role="img" aria-label={product.name} />
      {product.brand && <p className="fd-product__brand">{product.brand}</p>}
      <h1 className="fd-product__name">{product.name}</h1>
      <VolumeSelector variants={product.variants} value={activeVolume} onChange={setVolume} locale={locale} />
      <button
        type="button"
        onClick={handleAdd}
        disabled={activeVariant == null || isOutOfStock(activeVariant)}
        aria-label={t('add_aria').replace('{name}', product.name)}
      >
        {t('add_label')}
      </button>
      {product.description && <p className="fd-product__description">{product.description}</p>}
      {notes.length > 0 && (
        <section className="fd-product__notes" aria-label={t('notes_pyramid')}>
          <h2>{t('notes_pyramid')}</h2>
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
        <section aria-label={t('specs_title')}>
          <h2>{t('specs_title')}</h2>
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
      <section className="fd-product__similar" aria-label={t('similar_title')}>
        <h2>{t('similar_title')}</h2>
        {similar.length === 0 ? (
          <p role="status">{t('similar_empty')}</p>
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

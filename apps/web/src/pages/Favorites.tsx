import { useEffect, useState } from 'react';
import { EmptyState, Skeleton } from '../components/feedback';
import { fetchCatalog, type FetchFn, type Product } from '../lib/api';
import { formatPriceMinor, minVariantPrice } from '../components/ProductCard';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';
import { getOwnerId, getStorage } from '../lib/cart';

const FAVORITES_PREFIX = 'freshdoze:favorites';

export function favoritesStorageKey(ownerId: string = getOwnerId()): string {
  return `${FAVORITES_PREFIX}:${ownerId}`;
}

/** Hearts list is localStorage-only by decision — no backend sync. */
export function loadFavorites(ownerId: string = getOwnerId()): string[] {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(favoritesStorageKey(ownerId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

export function persistFavorites(ids: string[], ownerId: string = getOwnerId()): boolean {
  try {
    const storage = getStorage();
    if (!storage) throw new Error('localStorage unavailable');
    storage.setItem(favoritesStorageKey(ownerId), JSON.stringify(ids));
    return true;
  } catch (error) {
    console.warn('favorites: localStorage quota exceeded, keeping in-memory state', error);
    return false;
  }
}

export function toggleFavorite(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
}

interface FavoritesPageProps {
  /** Deprecated compat seam — details now resolve via the catalog. */
  resolveName?: (id: string) => string;
  /** Test seam — defaults to the global fetch. */
  fetchImpl?: FetchFn;
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: FavoritesLocale;
}

export type FavoritesLocale = 'uk' | 'ru';

const FAVORITES_STRINGS: Record<FavoritesLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

function fromPriceMinor(product: Product): number | null {
  if (product.variants.length === 0) return null;
  const min = minVariantPrice(product);
  return Number.isFinite(min) ? min : null;
}

/** Favorites page: hearts list from localStorage resolved against ONE catalog fetch. */
export default function Favorites({ fetchImpl, locale = 'uk' }: FavoritesPageProps) {
  const t = (key: string): string => FAVORITES_STRINGS[locale][key] ?? key;
  const [ids, setIds] = useState<string[]>(() => loadFavorites());
  const [items, setItems] = useState<Product[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    persistFavorites(ids);
  }, [ids]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const fetcher: FetchFn = fetchImpl ?? ((input, init) => fetch(input, init));
    void fetchCatalog(undefined, fetcher).then(
      (page) => {
        if (cancelled) return;
        setItems(page.items);
        setStatus('ready');
      },
      () => {
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, fetchImpl]);

  if (ids.length === 0) {
    return (
      <section className="fd-favorites" aria-label={t('favorites_title')}>
        <h1>{t('favorites_title')}</h1>
        <EmptyState title={t('favorites_empty')} action={<a href="#/">{t('favorites_to_catalog')}</a>} />
      </section>
    );
  }

  if (status === 'loading') {
    return (
      <section className="fd-favorites" aria-label={t('favorites_title')}>
        <h1>{t('favorites_title')}</h1>
        <div aria-label={t('loading')}>
          <Skeleton height={72} label={t('loading')} locale={locale} />
          <Skeleton height={72} label={t('loading')} locale={locale} />
        </div>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="fd-favorites" aria-label={t('favorites_title')}>
        <h1>{t('favorites_title')}</h1>
        <p role="alert">{t('home_load_error')}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          {t('retry')}
        </button>
      </section>
    );
  }

  // Missing products (deleted ids) are hidden — no crash, no placeholder row.
  const resolved = ids
    .map((id) => items.find((p) => String(p.id) === id))
    .filter((p): p is Product => p !== undefined);

  if (resolved.length === 0) {
    return (
      <section className="fd-favorites" aria-label={t('favorites_title')}>
        <h1>{t('favorites_title')}</h1>
        <EmptyState title={t('favorites_empty')} action={<a href="#/">{t('favorites_to_catalog')}</a>} />
      </section>
    );
  }

  const currency = t('currency') === 'currency' ? '₴' : t('currency');

  return (
    <section className="fd-favorites" aria-label={t('favorites_title')}>
      <h1>{t('favorites_title')}</h1>
      <ul>
        {resolved.map((p) => {
          const fromPrice = fromPriceMinor(p);
          return (
            <li key={p.id}>
              <a href={`#/product/${p.id}`} className="fd-favorites__link">
                <div className="fd-favorites__image" role="img" aria-label={p.name} />
                {p.brand && <p className="fd-favorites__brand">{p.brand}</p>}
                <span className="fd-favorites__name">{p.name}</span>
                {fromPrice != null && (
                  <span className="fd-favorites__price">
                    {formatPriceMinor(fromPrice)} {currency}
                  </span>
                )}
              </a>
              <span aria-label={t('favorites_in_list')}>♥</span>
              <button
                type="button"
                aria-label={t('favorites_remove_label').replace('{name}', p.name)}
                onClick={(e) => {
                  e.stopPropagation();
                  setIds((prev) => toggleFavorite(prev, String(p.id)));
                }}
              >
                {t('favorites_remove')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

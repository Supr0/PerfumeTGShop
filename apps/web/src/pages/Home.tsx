/**
 * Home — catalog page wired to GET /v1/catalog.
 *
 * Filter/sort/search are server-owned: every filter/search/sort change
 * re-fetches via buildCatalogQuery (search input debounced ~300ms).
 * Add-to-cart writes straight into the cart store.
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog, type FetchFn } from '../lib/api';
import { addItem, loadCart, persistCart } from '../lib/cart';
import { ProductCard } from '../components/ProductCard';
import type { Product, AddToCartHandler } from '../components/ProductCard';
import { FilterSheet, DEFAULT_FILTERS } from '../components/FilterSheet';
import type { FilterValue } from '../components/FilterSheet';
import { EmptyState, Skeleton, Toast } from '../components/feedback';
import { loadFavorites, persistFavorites, toggleFavorite } from './Favorites';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';

export type HomeLocale = 'uk' | 'ru';

const HOME_STRINGS: Record<HomeLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

const SEARCH_DEBOUNCE_MS = 300;

/** Unique sorted values, flattening array fields (season) into individuals. */
function unique(values: Array<string | string[] | null | undefined>): string[] {
  const flat = values.flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]));
  return [...new Set(flat.filter((v): v is string => typeof v === 'string' && v !== ''))].sort();
}

/**
 * Translate UI filter state into the server query contract
 * (GET /v1/catalog). Sort keys are forwarded verbatim — the UI vocab
 * IS the server vocab {popular,price_asc,price_desc,new}.
 *
 * NOTE on multi-selects: the UI keeps arrays for gender/season while the
 * server contract is single-value today. Each selected entry is sent as a
 * repeated query param with no client-side collapsing, so the full intent
 * reaches the server and multi-value support can land server-side
 * without UI changes.
 */
export function buildCatalogQuery(filters: FilterValue, query: string): URLSearchParams {
  const params = new URLSearchParams();
  for (const b of filters.brands) params.append('brand', b);
  for (const f of filters.families) params.append('family', f);
  for (const g of filters.genders) params.append('gender', g);
  for (const s of filters.seasons) params.append('season', s);
  if (filters.price_min != null) params.set('min_price', String(filters.price_min));
  if (filters.price_max != null) params.set('max_price', String(filters.price_max));
  if (filters.in_stock_only) params.set('in_stock', 'true');
  params.set('sort', filters.sort);
  const q = query.trim();
  if (q !== '') params.set('q', q);
  return params;
}

interface HomeProps {
  /** Test seam — defaults to the global fetch. */
  fetchImpl?: FetchFn;
  onAddToCart?: AddToCartHandler;
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: HomeLocale;
}

export function Home({ fetchImpl, onAddToCart, locale = 'uk' }: HomeProps) {
  const t = (key: string): string => HOME_STRINGS[locale][key] ?? key;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFamily, setActiveFamily] = useState<string>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState<FilterValue>(DEFAULT_FILTERS);
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [items, setItems] = useState<Product[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    persistFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const params = buildCatalogQuery(filters, debouncedQuery);
    if (activeFamily !== 'all') params.append('family', activeFamily);
    void fetchCatalog(params, fetchImpl ?? ((input, init) => fetch(input, init))).then(
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
  }, [filters, debouncedQuery, activeFamily, attempt, fetchImpl]);

  const families = useMemo(() => unique(items.map((p) => p.family)), [items]);
  const brands = useMemo(() => unique(items.map((p) => p.brand)), [items]);
  const genders = useMemo(() => unique(items.map((p) => p.gender)), [items]);
  const seasons = useMemo(() => unique(items.map((p) => p.season)), [items]);

  const resetAll = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery('');
    setDebouncedQuery('');
    setActiveFamily('all');
    setAttempt((n) => n + 1);
  };

  const handleAdd: AddToCartHandler = (productId, variantId) => {
    const product = items.find((p) => p.id === productId);
    const variant = product?.variants.find((v) => v.id === variantId);
    // addItem is a no-op when stock is 0, and persistCart can fail when
    // storage is unavailable — only claim success when the line landed.
    // Toasting unconditionally masked failed adds (tap → toast → empty cart).
    let added = false;
    if (product && variant && variant.stock > 0) {
      const next = addItem(
        loadCart(),
        {
          productId: String(productId),
          variantId,
          volume_ml: variant.volume_ml,
          qty: 1,
          price: variant.price_minor_uah / 100,
          name: product.name,
        },
        variant.stock,
      );
      added = persistCart(next);
    }
    onAddToCart?.(productId, variantId);
    setToast(t(added ? 'added_to_cart' : 'add_failed'));
  };

  const toggleHeart = (productId: number) => {
    setFavorites((prev) => toggleFavorite(prev, String(productId)));
  };

  return (
    <section className="fd-home" aria-label={t('catalog')}>
      <input
        type="search"
        aria-label={t('search')}
        placeholder={t('search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="fd-chips" role="group" aria-label={t('chips_group')}>
        <button
          type="button"
          aria-pressed={activeFamily === 'all'}
          onClick={() => setActiveFamily('all')}
        >
          {t('chips_all')}
        </button>
        {families.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={activeFamily === f}
            onClick={() => setActiveFamily(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setSheetOpen(true)}>
        {t('filters')}
      </button>
      <FilterSheet
        open={sheetOpen}
        brands={brands}
        families={families}
        genders={genders}
        seasons={seasons}
        value={filters}
        onChange={setFilters}
        onClose={() => setSheetOpen(false)}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        locale={locale}
      />
      {status === 'loading' ? (
        <div className="fd-grid" aria-label={t('home_loading')}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={180} label={t('loading')} locale={locale} />
          ))}
        </div>
      ) : status === 'error' ? (
        <div>
          <p role="alert">{t('home_load_error')}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            {t('retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t('home_empty')}
          action={
            <button type="button" onClick={resetAll}>
              {t('home_reset_filters')}
            </button>
          }
        />
      ) : (
        <div className="fd-grid">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isFavorite={favorites.includes(String(p.id))}
              onAdd={handleAdd}
              onToggleFavorite={toggleHeart}
              locale={locale}
            />
          ))}
        </div>
      )}
      {toast && <Toast message={toast} kind="success" />}
    </section>
  );
}

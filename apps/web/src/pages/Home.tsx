/**
 * Home — catalog page: search + family chips + product grid +
 * bottom-sheet filters + skeletons + empty state.
 *
 * Cart store itself is Step 7; add-to-cart is dispatched via the
 * `onAddToCart(productId, variantId)` callback prop for now.
 */
import { useEffect, useMemo, useState } from 'react';
import { ProductCard, hasInStockVariant, minVariantPrice } from '../components/ProductCard';
import type { Product, AddToCartHandler } from '../components/ProductCard';
import { FilterSheet, DEFAULT_FILTERS } from '../components/FilterSheet';
import type { FilterValue } from '../components/FilterSheet';
import { Skeleton, Toast } from '../components/feedback';
import { loadFavorites, persistFavorites, toggleFavorite } from './Favorites';

const EMPTY_LABEL = 'Нічого не знайдено';
const ADDED_LABEL = 'Додано до кошика';

/** Unique sorted values, flattening array fields (season) into individuals. */
function unique(values: Array<string | string[] | null | undefined>): string[] {
  const flat = values.flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]));
  return [...new Set(flat.filter((v): v is string => typeof v === 'string' && v !== ''))].sort();
}

function matchesQuery(p: Product, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const hay = `${p.name} ${p.brand ?? ''} ${p.description ?? ''}`.toLowerCase();
  return hay.includes(q);
}

/** Optional-field filters only apply when the product carries the field. */
function matchesFilters(p: Product, f: FilterValue): boolean {
  if (f.brands.length > 0 && (p.brand == null || !f.brands.includes(p.brand))) return false;
  if (f.families.length > 0 && (p.family == null || !f.families.includes(p.family))) return false;
  if (f.genders.length > 0 && (p.gender == null || !f.genders.includes(p.gender))) return false;
  if (f.seasons.length > 0 && (p.season == null || !p.season.some((s) => f.seasons.includes(s))))
    return false;
  if (f.in_stock_only && !hasInStockVariant(p)) return false;
  const minMajor = minVariantPrice(p) / 100;
  if (f.price_min != null && minMajor < f.price_min) return false;
  if (f.price_max != null && minMajor > f.price_max) return false;
  return true;
}

function sortProducts(items: Product[], sort: FilterValue['sort']): Product[] {
  const copy = [...items];
  switch (sort) {
    case 'price_asc':
      return copy.sort((a, b) => minVariantPrice(a) - minVariantPrice(b));
    case 'price_desc':
      return copy.sort((a, b) => minVariantPrice(b) - minVariantPrice(a));
    case 'new':
      return copy.sort((a, b) => b.id - a.id);
    case 'popular':
    default:
      return copy.sort((a, b) => Number(b.is_hit ?? false) - Number(a.is_hit ?? false));
  }
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
  products?: Product[];
  loading?: boolean;
  onAddToCart?: AddToCartHandler;
}

export function Home({ products = [], loading = false, onAddToCart }: HomeProps) {
  const [query, setQuery] = useState('');
  const [activeFamily, setActiveFamily] = useState<string>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState<FilterValue>(DEFAULT_FILTERS);
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    persistFavorites(favorites);
  }, [favorites]);

  const families = useMemo(() => unique(products.map((p) => p.family)), [products]);
  const brands = useMemo(() => unique(products.map((p) => p.brand)), [products]);
  const genders = useMemo(() => unique(products.map((p) => p.gender)), [products]);
  const seasons = useMemo(() => unique(products.map((p) => p.season)), [products]);

  const visible = useMemo(() => {
    const filtered = products.filter(
      (p) =>
        matchesQuery(p, query) &&
        (activeFamily === 'all' || p.family === activeFamily) &&
        matchesFilters(p, filters),
    );
    return sortProducts(filtered, filters.sort);
  }, [products, query, activeFamily, filters]);

  const handleAdd: AddToCartHandler = (productId, variantId) => {
    onAddToCart?.(productId, variantId);
    setToast(ADDED_LABEL);
  };

  const toggleHeart = (productId: number) => {
    setFavorites((prev) => toggleFavorite(prev, String(productId)));
  };

  return (
    <section className="fd-home" aria-label="Каталог">
      <input
        type="search"
        aria-label="Пошук"
        placeholder="Пошук"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="fd-chips" role="group" aria-label="Сімейства">
        <button
          type="button"
          aria-pressed={activeFamily === 'all'}
          onClick={() => setActiveFamily('all')}
        >
          Всі
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
        Фільтри
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
      />
      {loading ? (
        <div className="fd-grid" aria-label="Завантаження каталогу">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={180} label="Завантаження…" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p role="status">{EMPTY_LABEL}</p>
      ) : (
        <div className="fd-grid">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isFavorite={favorites.includes(String(p.id))}
              onAdd={handleAdd}
              onToggleFavorite={toggleHeart}
            />
          ))}
        </div>
      )}
      {toast && <Toast message={toast} kind="success" />}
    </section>
  );
}

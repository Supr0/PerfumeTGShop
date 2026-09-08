/**
 * Thin fetch layer over the frozen catalog/checkout contracts.
 *
 * Types mirror `apps/api/schemas/catalog.py` exactly — the canonical
 * ProductOut/VariantOut shapes live in `components/ProductCard.tsx`
 * and are re-exported here so pages import from one place.
 * HTTP errors map to a typed ApiError; the 409 body (with its
 * `volumes` array) is preserved for the checkout out-of-stock UI.
 */
import type { Product, VariantOut } from '../components/ProductCard';
import { authHeaders } from './tma';

export type { Product, VariantOut };

export const CATALOG_URL = '/v1/catalog';
export const PRODUCT_URL = '/v1/products';
export const DEFAULT_CATALOG_LIMIT = 60;

/** One row of the real 409 payload: {detail:"out_of_stock", volumes:[...]}. */
export interface OutOfStockVolume {
  variant_id: number;
  ml: number;
  stock: number;
}

export interface NetworkError {
  kind: 'network';
}

export interface HttpError {
  kind: 'http';
  status: number;
  detail?: string;
  volumes?: OutOfStockVolume[];
}

export type ApiError = NetworkError | HttpError;

export interface CatalogPage {
  items: Product[];
  total: number;
}

/** Minimal fetch surface (structural — `fetch` itself satisfies it). */
export interface ApiResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<ApiResponse>;

const defaultFetch: FetchFn = (input, init) => fetch(input, init);

/** Keep only well-formed 409 volume rows; anything else → []. */
export function parseOutOfStockVolumes(payload: unknown): OutOfStockVolume[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const volumes = (payload as { volumes?: unknown }).volumes;
  if (!Array.isArray(volumes)) return [];
  return volumes.filter(
    (v): v is OutOfStockVolume =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as { variant_id?: unknown }).variant_id === 'number' &&
      typeof (v as { ml?: unknown }).ml === 'number' &&
      typeof (v as { stock?: unknown }).stock === 'number',
  );
}

async function getJson(url: string, fetchFn: FetchFn): Promise<unknown> {
  let res: ApiResponse;
  try {
    res = await fetchFn(url, { headers: { ...authHeaders() } });
  } catch {
    throw { kind: 'network' } satisfies ApiError;
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const body = typeof payload === 'object' && payload !== null ? (payload as { detail?: unknown }) : {};
    const detail = typeof body.detail === 'string' ? body.detail : undefined;
    const volumes = parseOutOfStockVolumes(payload);
    const error: HttpError = { kind: 'http', status: res.status };
    if (detail !== undefined) error.detail = detail;
    if (volumes.length > 0) error.volumes = volumes;
    throw error;
  }
  return payload;
}

/** Server-owned filter/sort: query params are forwarded verbatim. */
export async function fetchCatalog(query?: URLSearchParams, fetchFn: FetchFn = defaultFetch): Promise<CatalogPage> {
  const params = new URLSearchParams(query?.toString() ?? '');
  if (!params.has('limit')) params.set('limit', String(DEFAULT_CATALOG_LIMIT));
  const payload = (await getJson(`${CATALOG_URL}?${params.toString()}`, fetchFn)) as Partial<CatalogPage> | null;
  const items = Array.isArray(payload?.items) ? (payload.items as Product[]) : [];
  const total = typeof payload?.total === 'number' ? payload.total : items.length;
  return { items, total };
}

/** Full product detail with variants; 404 when missing or inactive. */
export async function fetchProduct(productId: number, fetchFn: FetchFn = defaultFetch): Promise<Product> {
  return (await getJson(`${PRODUCT_URL}/${productId}`, fetchFn)) as Product;
}

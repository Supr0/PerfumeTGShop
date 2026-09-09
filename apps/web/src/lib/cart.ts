import { getInitData } from './tma';

export const MIN_QTY = 1;
export const MAX_QTY = 99;

const STORAGE_PREFIX = 'freshdoze:cart';
export const GUEST_OWNER_ID = 'guest';

/** Null-safe accessor: localStorage may be absent (SSR, blocked cookies). */
export function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    if (candidate) return candidate;
  } catch {
    // Storage blocked — callers fall back to memory-only state.
  }
  return null;
}

export interface CartItem {
  /** String(product.id) at the cart boundary — ProductCard emits numbers. */
  productId: string;
  /** Checkout FK: the exact ProductVariant.id being bought. */
  variantId: number;
  /** Purchasable volume in ml (3 | 5 | 10) — numbers everywhere, no '50ml' vocab. */
  volume_ml: number;
  qty: number;
  price: number;
  name?: string;
}

export type CartState = CartItem[];

export type SwitchVolumeResult =
  | { ok: true; state: CartState }
  | { ok: false; reason: 'out_of_stock' | 'line_not_found' | 'already_in_cart'; state: CartState };

/** Identity of a cart line: product + volume_ml (volumes are separate lines). */
export function cartItemKey(productId: string | number, volume_ml: number): string {
  return `${String(productId)}::${volume_ml}`;
}

/**
 * Owner id for storage namespacing, parsed from Telegram initData
 * (`user={"id":123,...}`). Falls back to "guest" outside Telegram —
 * favorites/cart stay local-only, never synced to a backend.
 */
export function getOwnerId(): string {
  try {
    const params = new URLSearchParams(getInitData());
    const rawUser = params.get('user');
    if (!rawUser) return GUEST_OWNER_ID;
    const parsed: unknown = JSON.parse(rawUser);
    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed) {
      const id = (parsed as { id: unknown }).id;
      if (typeof id === 'number' || typeof id === 'string') return String(id);
    }
  } catch {
    // Malformed initData — treat as guest, cart still works locally.
  }
  return GUEST_OWNER_ID;
}

export function cartStorageKey(ownerId: string = getOwnerId()): string {
  return `${STORAGE_PREFIX}:${ownerId}`;
}

function clampQty(qty: number, stock: number): number {
  const cap = Math.min(Math.max(Math.floor(stock), 0), MAX_QTY);
  if (cap < MIN_QTY) return MIN_QTY;
  return Math.min(Math.max(Math.floor(qty) || MIN_QTY, MIN_QTY), cap);
}

function isValidItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.productId === 'string' &&
    typeof v.variantId === 'number' &&
    typeof v.volume_ml === 'number' &&
    typeof v.qty === 'number' &&
    typeof v.price === 'number'
  );
}

/**
 * Load stored lines on boot. Stored items are kept as-is — there is no
 * server merge (cart is local-only until checkout recomputes server-side).
 */
export function loadCart(ownerId: string = getOwnerId()): CartState {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(cartStorageKey(ownerId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem);
  } catch {
    return [];
  }
}

/**
 * Persist lines to namespaced localStorage. Returns false (and warns) when
 * the quota is exceeded — the caller keeps the in-memory state, nothing
 * is lost for the current session.
 */
export function persistCart(state: CartState, ownerId: string = getOwnerId()): boolean {
  try {
    const storage = getStorage();
    if (!storage) throw new Error('localStorage unavailable');
    storage.setItem(cartStorageKey(ownerId), JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn('cart: localStorage quota exceeded, keeping in-memory state', error);
    return false;
  }
}

/**
 * Add a line (merge qty when productId + volume_ml match).
 * `stock` is passed in by the caller — the store never fetches inventory.
 * Adding an out-of-stock line is a no-op.
 */
export function addItem(state: CartState, item: CartItem, stock: number): CartState {
  if (stock <= 0) return state;
  const key = cartItemKey(item.productId, item.volume_ml);
  const existing = state.find((line) => cartItemKey(line.productId, line.volume_ml) === key);
  if (!existing) {
    return [...state, { ...item, qty: clampQty(item.qty, stock) }];
  }
  return state.map((line) =>
    cartItemKey(line.productId, line.volume_ml) === key
      ? { ...line, qty: clampQty(line.qty + item.qty, stock) }
      : line,
  );
}

/**
 * Set a line qty. When stock drops to zero the line is removed —
 * an unbought out-of-stock row must not linger in the cart.
 */
export function updateQty(
  state: CartState,
  productId: string,
  volume_ml: number,
  qty: number,
  stock: number,
): CartState {
  const key = cartItemKey(productId, volume_ml);
  if (!state.some((line) => cartItemKey(line.productId, line.volume_ml) === key)) return state;
  if (stock <= 0) {
    return state.filter((line) => cartItemKey(line.productId, line.volume_ml) !== key);
  }
  return state.map((line) =>
    cartItemKey(line.productId, line.volume_ml) === key ? { ...line, qty: clampQty(qty, stock) } : line,
  );
}

export function removeItem(state: CartState, productId: string, volume_ml: number): CartState {
  const key = cartItemKey(productId, volume_ml);
  return state.filter((line) => cartItemKey(line.productId, line.volume_ml) !== key);
}

/**
 * Move a line to another volume, preserving qty (silently clamped to
 * target stock). Rejects with a reason (state unchanged) when the target
 * is out of stock, the source is missing, or the target volume is already
 * a different line (variant A — no silent merge, the UI notices).
 */
export function switchVolume(
  state: CartState,
  productId: string,
  fromVolumeMl: number,
  toVolumeMl: number,
  targetStock: number,
  targetVariantId: number,
): SwitchVolumeResult {
  const fromKey = cartItemKey(productId, fromVolumeMl);
  const source = state.find((line) => cartItemKey(line.productId, line.volume_ml) === fromKey);
  if (!source) return { ok: false, reason: 'line_not_found', state };
  if (targetStock <= 0) return { ok: false, reason: 'out_of_stock', state };
  const toKey = cartItemKey(productId, toVolumeMl);
  if (toKey !== fromKey && state.some((line) => cartItemKey(line.productId, line.volume_ml) === toKey)) {
    return { ok: false, reason: 'already_in_cart', state };
  }
  const rest = state.filter(
    (line) => cartItemKey(line.productId, line.volume_ml) !== fromKey && cartItemKey(line.productId, line.volume_ml) !== toKey,
  );
  const qty = clampQty(source.qty, targetStock);
  const merged: CartItem = {
    ...source,
    productId,
    variantId: targetVariantId,
    volume_ml: toVolumeMl,
    qty,
  };
  return { ok: true, state: [...rest, merged] };
}

/**
 * Line total for DISPLAY ONLY — the server recomputes all totals at
 * checkout, so this value is never trusted for payment (see prior lesson).
 */
export function cartTotal(state: CartState): number {
  return state.reduce((sum, line) => sum + line.price * line.qty, 0);
}

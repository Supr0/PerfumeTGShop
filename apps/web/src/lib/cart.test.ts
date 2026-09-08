import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_QTY,
  MIN_QTY,
  addItem,
  cartItemKey,
  cartStorageKey,
  cartTotal,
  loadCart,
  persistCart,
  removeItem,
  switchVolume,
  updateQty,
  type CartItem,
} from './cart';

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  productId: '1',
  variantId: 11,
  volume_ml: 3,
  qty: 1,
  price: 100,
  name: 'Test Parfum',
  ...overrides,
});

/** jsdom here exposes no localStorage — hermetic in-memory shim per test. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

let mem: MemoryStorage;

beforeEach(() => {
  mem = new MemoryStorage();
  Object.defineProperty(window, 'localStorage', { value: mem, configurable: true });
  vi.restoreAllMocks();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe('cartItemKey', () => {
  it('should key items by productId + volume_ml', () => {
    expect(cartItemKey('1', 3)).toBe('1::3');
    expect(cartItemKey('1', 3)).not.toBe(cartItemKey('1', 5));
    expect(cartItemKey('1', 3)).not.toBe(cartItemKey('2', 3));
  });

  it('should coerce numeric product ids at the cart boundary', () => {
    expect(cartItemKey(1, 3)).toBe('1::3');
  });
});

describe('addItem', () => {
  it('should add a new item to an empty cart', () => {
    const state = addItem([], item({ qty: 2 }), 10);
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ productId: '1', volume_ml: 3, qty: 2 });
  });

  it('should merge quantity when the same productId + volume_ml is added again', () => {
    const state = addItem([item({ qty: 1 })], item({ qty: 2 }), 10);
    expect(state).toHaveLength(1);
    expect(state[0].qty).toBe(3);
  });

  it('should keep volumes of the same product as separate lines', () => {
    const state = addItem([item({ volume_ml: 3, qty: 1 })], item({ volume_ml: 5, qty: 1 }), 10);
    expect(state).toHaveLength(2);
  });

  it('should not mutate the input state', () => {
    const prev = [item({ qty: 1 })];
    addItem(prev, item({ qty: 1 }), 10);
    expect(prev[0].qty).toBe(1);
    expect(prev).toHaveLength(1);
  });

  it('should leave state unchanged when stock is zero', () => {
    expect(addItem([], item({ qty: 1 }), 0)).toEqual([]);
  });
});

describe('qty bounds', () => {
  it('should clamp added quantity to available stock', () => {
    const state = addItem([], item({ qty: 9 }), 5);
    expect(state[0].qty).toBe(5);
  });

  it('should never exceed MAX_QTY even when stock is huge', () => {
    const state = addItem([], item({ qty: 500 }), 1000);
    expect(state[0].qty).toBe(MAX_QTY);
    expect(MAX_QTY).toBe(99);
    expect(MIN_QTY).toBe(1);
  });

  it('should clamp updateQty into 1..99 and at most stock', () => {
    const base = [item({ qty: 2 })];
    expect(updateQty(base, '1', 3, 0, 10)[0].qty).toBe(1);
    expect(updateQty(base, '1', 3, -5, 10)[0].qty).toBe(1);
    expect(updateQty(base, '1', 3, 500, 1000)[0].qty).toBe(99);
    expect(updateQty(base, '1', 3, 8, 5)[0].qty).toBe(5);
    expect(updateQty(base, '1', 3, 3, 10)[0].qty).toBe(3);
  });

  it('should remove the line when stock drops to zero', () => {
    const base = [item({ qty: 2 })];
    expect(updateQty(base, '1', 3, 2, 0)).toEqual([]);
  });

  it('should leave state unchanged when updating an unknown line', () => {
    const base = [item({ qty: 2 })];
    expect(updateQty(base, 'nope', 3, 5, 10)).toEqual(base);
  });
});

describe('removeItem', () => {
  it('should remove only the matching productId + volume_ml line', () => {
    const base = [item({ volume_ml: 3 }), item({ volume_ml: 5 })];
    const state = removeItem(base, '1', 3);
    expect(state).toHaveLength(1);
    expect(state[0].volume_ml).toBe(5);
  });
});

describe('switchVolume', () => {
  it('should move quantity to the new volume and drop the old line', () => {
    const base = [item({ volume_ml: 3, variantId: 11, qty: 3 })];
    const res = switchVolume(base, '1', 3, 5, 10, 12);
    expect(res.ok).toBe(true);
    expect(res.state).toHaveLength(1);
    expect(res.state[0]).toMatchObject({ volume_ml: 5, variantId: 12, qty: 3 });
  });

  it('should merge into the target line when it already exists, capped by stock', () => {
    const base = [item({ volume_ml: 3, variantId: 11, qty: 3 }), item({ volume_ml: 5, variantId: 12, qty: 4 })];
    const res = switchVolume(base, '1', 3, 5, 5, 12);
    expect(res.ok).toBe(true);
    expect(res.state).toHaveLength(1);
    expect(res.state[0].qty).toBe(5);
  });

  it('should reject the switch when the target volume is out of stock', () => {
    const base = [item({ volume_ml: 3, qty: 3 })];
    const res = switchVolume(base, '1', 3, 5, 0, 12);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('out_of_stock');
    expect(res.state).toEqual(base);
  });

  it('should reject the switch when the source line does not exist', () => {
    const res = switchVolume([], '1', 3, 5, 10, 12);
    expect(res.ok).toBe(false);
    expect(res.state).toEqual([]);
  });
});

describe('cartTotal', () => {
  it('should sum price * qty over all lines', () => {
    const state = [item({ price: 100, qty: 2 }), item({ productId: '2', variantId: 21, volume_ml: 5, price: 50, qty: 1 })];
    expect(cartTotal(state)).toBe(250);
  });

  it('should return 0 for an empty cart', () => {
    expect(cartTotal([])).toBe(0);
  });
});

describe('persistence', () => {
  it('should round-trip state through localStorage', () => {
    const state = [item({ qty: 2 }), item({ productId: '2', variantId: 21, volume_ml: 5, price: 50, qty: 1 })];
    expect(persistCart(state, 'u1')).toBe(true);
    expect(loadCart('u1')).toEqual(state);
  });

  it('should return an empty cart when nothing was stored', () => {
    expect(loadCart('nobody')).toEqual([]);
  });

  it('should keep stored items on load with no server merge', () => {
    persistCart([item({ qty: 2 })], 'u1');
    // Loading again returns exactly what was stored — no remote merge.
    expect(loadCart('u1')).toEqual([item({ qty: 2 })]);
  });

  it('should namespace storage per telegram user id', () => {
    persistCart([item({ qty: 1 })], 'user-111');
    persistCart([item({ qty: 7 })], 'user-222');
    expect(loadCart('user-111')[0].qty).toBe(1);
    expect(loadCart('user-222')[0].qty).toBe(7);
    expect(cartStorageKey('user-111')).not.toBe(cartStorageKey('user-222'));
  });

  it('should fall back to the guest namespace outside Telegram', () => {
    persistCart([item({ qty: 4 })]);
    expect(cartStorageKey()).toContain('guest');
    expect(loadCart('guest')).toEqual(loadCart());
  });

  it('should keep in-memory state and warn when quota is exceeded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(mem, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const state = [item({ qty: 2 })];
    expect(persistCart(state, 'u1')).toBe(false);
    expect(warn).toHaveBeenCalled();
    // Memory state untouched — caller keeps using it.
    expect(state).toEqual([item({ qty: 2 })]);
  });

  it('should drop malformed stored payloads instead of crashing', () => {
    mem.setItem(cartStorageKey('u1'), 'not-json{{{');
    expect(loadCart('u1')).toEqual([]);
  });
});

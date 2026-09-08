import { useEffect, useState } from 'react';
import { EmptyState } from '../components/feedback';
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
  resolveName?: (id: string) => string;
}

/** Favorites page: hearts list from localStorage with an empty state. */
export default function Favorites({ resolveName = (id) => id }: FavoritesPageProps) {
  const [ids, setIds] = useState<string[]>(() => loadFavorites());

  useEffect(() => {
    persistFavorites(ids);
  }, [ids]);

  if (ids.length === 0) {
    return (
      <section aria-label="Избранное">
        <h1>Избранное</h1>
        <EmptyState title="В избранном пока пусто" action={<a href="#/">Перейти к каталогу</a>} />
      </section>
    );
  }

  return (
    <section aria-label="Избранное">
      <h1>Избранное</h1>
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <span aria-label="В избранном">♥</span>
            <span>{resolveName(id)}</span>
            <button
              type="button"
              aria-label={`Убрать ${resolveName(id)} из избранного`}
              onClick={() => setIds((prev) => toggleFavorite(prev, id))}
            >
              Убрать
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

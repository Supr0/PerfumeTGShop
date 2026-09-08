import { useEffect, useState } from 'react';
import { EmptyState } from '../components/feedback';
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
  resolveName?: (id: string) => string;
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: FavoritesLocale;
}

export type FavoritesLocale = 'uk' | 'ru';

const FAVORITES_STRINGS: Record<FavoritesLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

/** Favorites page: hearts list from localStorage with an empty state. */
export default function Favorites({ resolveName = (id) => id, locale = 'uk' }: FavoritesPageProps) {
  const t = (key: string): string => FAVORITES_STRINGS[locale][key] ?? key;
  const [ids, setIds] = useState<string[]>(() => loadFavorites());

  useEffect(() => {
    persistFavorites(ids);
  }, [ids]);

  if (ids.length === 0) {
    return (
      <section className="fd-favorites" aria-label={t('favorites_title')}>
        <h1>{t('favorites_title')}</h1>
        <EmptyState title={t('favorites_empty')} action={<a href="#/">{t('favorites_to_catalog')}</a>} />
      </section>
    );
  }

  return (
    <section className="fd-favorites" aria-label={t('favorites_title')}>
      <h1>{t('favorites_title')}</h1>
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <span aria-label={t('favorites_in_list')}>♥</span>
            <span>{resolveName(id)}</span>
            <button
              type="button"
              aria-label={t('favorites_remove_label').replace('{name}', resolveName(id))}
              onClick={() => setIds((prev) => toggleFavorite(prev, id))}
            >
              {t('favorites_remove')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

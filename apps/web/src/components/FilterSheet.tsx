/**
 * FilterSheet — bottom-sheet with catalog filters.
 * Controlled component: Home owns the FilterValue state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Sort keys match the server vocab (GET /v1/catalog ?sort=) verbatim. */
export type SortKey = 'popular' | 'price_asc' | 'price_desc' | 'new';

export interface FilterValue {
  brands: string[];
  families: string[];
  genders: string[];
  price_min: number | null;
  price_max: number | null;
  seasons: string[];
  in_stock_only: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterValue = {
  brands: [],
  families: [],
  genders: [],
  price_min: null,
  price_max: null,
  seasons: [],
  in_stock_only: false,
  sort: 'popular',
};

/** Close-animation window in ms — mirrors the CSS slide-down/fade duration. */
export const FILTER_SHEET_CLOSE_MS = 200;

interface MultiCheckProps {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}

function MultiCheck({ title, options, selected, onToggle }: MultiCheckProps) {
  if (options.length === 0) return null;
  return (
    <fieldset className="fd-filter-group">
      <legend>{title}</legend>
      {options.map((opt) => (
        <label key={opt} className="fd-filter-option">
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => onToggle(opt)}
          />
          {opt}
        </label>
      ))}
    </fieldset>
  );
}

interface FilterSheetProps {
  open: boolean;
  brands: string[];
  families: string[];
  genders: string[];
  seasons: string[];
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  onClose: () => void;
  onReset: () => void;
}

function toggleInList(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function toNullableNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function FilterSheet({
  open,
  brands,
  families,
  genders,
  seasons,
  value,
  onChange,
  onClose,
  onReset,
}: FilterSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Closing plays the slide-down/fade animation BEFORE the owner unmounts:
  // requestClose flips the closing class, then calls onClose after
  // FILTER_SHEET_CLOSE_MS.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
    }, FILTER_SHEET_CLOSE_MS);
  }, []);

  useEffect(() => {
    // Drop the pending close when the owner unmounts first.
    return () => {
      if (closeTimerRef.current !== undefined) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus bookkeeping: focus the first control on open,
    // return focus to the invoker on unmount/close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstControl = dialog?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), button:not([disabled])',
    );
    (firstControl ?? dialog)?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className={closing ? 'fd-filter-sheet fd-filter-sheet--closing' : 'fd-filter-sheet'}
      role="dialog"
      aria-modal="true"
      aria-label="Фільтри"
      tabIndex={-1}
    >
      <div
        className="fd-filter-sheet__backdrop"
        data-testid="filter-sheet-backdrop"
        onClick={requestClose}
      />
      <div className="fd-filter-sheet__body">
        <MultiCheck
          title="Бренд"
          options={brands}
          selected={value.brands}
          onToggle={(opt) => onChange({ ...value, brands: toggleInList(value.brands, opt) })}
        />
        <MultiCheck
          title="Сімейство"
          options={families}
          selected={value.families}
          onToggle={(opt) => onChange({ ...value, families: toggleInList(value.families, opt) })}
        />
        <MultiCheck
          title="Стать"
          options={genders}
          selected={value.genders}
          onToggle={(opt) => onChange({ ...value, genders: toggleInList(value.genders, opt) })}
        />
        <fieldset className="fd-filter-group">
          <legend>Ціна</legend>
          <label className="fd-filter-option" htmlFor="fd-price-min">
            Ціна від
          </label>
          <input
            id="fd-price-min"
            type="number"
            min={0}
            value={value.price_min ?? ''}
            onChange={(e) => onChange({ ...value, price_min: toNullableNumber(e.target.value) })}
          />
          <label className="fd-filter-option" htmlFor="fd-price-max">
            Ціна до
          </label>
          <input
            id="fd-price-max"
            type="number"
            min={0}
            value={value.price_max ?? ''}
            onChange={(e) => onChange({ ...value, price_max: toNullableNumber(e.target.value) })}
          />
        </fieldset>
        <MultiCheck
          title="Сезон"
          options={seasons}
          selected={value.seasons}
          onToggle={(opt) => onChange({ ...value, seasons: toggleInList(value.seasons, opt) })}
        />
        <label className="fd-filter-option">
          <input
            type="checkbox"
            checked={value.in_stock_only}
            onChange={(e) => onChange({ ...value, in_stock_only: e.target.checked })}
          />
          В наявності
        </label>
        <label className="fd-filter-option" htmlFor="fd-sort">
          Сортування
        </label>
        <select
          id="fd-sort"
          value={value.sort}
          onChange={(e) => onChange({ ...value, sort: e.target.value as SortKey })}
        >
          <option value="popular">За популярністю</option>
          <option value="price_asc">Дешевші спочатку</option>
          <option value="price_desc">Дорожчі спочатку</option>
          <option value="new">Новинки</option>
        </select>
        <div className="fd-filter-sheet__footer">
          <button type="button" onClick={onReset}>
            Скинути
          </button>
          <button type="button" onClick={requestClose}>
            Показати
          </button>
        </div>
      </div>
    </div>
  );
}

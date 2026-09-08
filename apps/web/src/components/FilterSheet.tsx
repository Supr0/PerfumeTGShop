/**
 * FilterSheet — bottom-sheet with catalog filters.
 * Controlled component: Home owns the FilterValue state.
 */

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
  if (!open) return null;

  return (
    <div className="fd-filter-sheet" role="dialog" aria-modal="true" aria-label="Фільтри">
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
          <button type="button" onClick={onClose}>
            Показати
          </button>
        </div>
      </div>
    </div>
  );
}

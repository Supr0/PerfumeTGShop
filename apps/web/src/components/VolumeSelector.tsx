import { formatPriceMinor, isOutOfStock } from './ProductCard';
import type { VariantOut } from './ProductCard';

const OOS_LABEL = 'Немає в наявності';

interface VolumeSelectorProps {
  variants: VariantOut[];
  /**
   * Selected volume in ml. Null/undefined renders the neutral state —
   * nothing checked, no selected price — until the user taps an option.
   * A concrete number renders exactly the legacy selected state.
   */
  value?: number | null;
  onChange: (volumeMl: number) => void;
  currency?: string;
  hideOutOfStock?: boolean;
  /**
   * Show each option's own price on its row ("3 ml — 390 ₴").
   * Defaults to false so product-page rendering stays unchanged.
   */
  showOptionPrices?: boolean;
}

export function VolumeSelector({
  variants,
  value = null,
  onChange,
  currency = '₴',
  hideOutOfStock = false,
  showOptionPrices = false,
}: VolumeSelectorProps) {
  const ordered = [...variants].sort((a, b) => a.volume_ml - b.volume_ml);
  const selected = value == null ? undefined : (ordered.find((v) => v.volume_ml === value) ?? ordered[0]);
  // hideOutOfStock hides OOS options, but the current value always stays
  // rendered (disabled + selected when OOS) so price/group stay coherent.
  const visible = hideOutOfStock ? ordered.filter((v) => !isOutOfStock(v) || v.volume_ml === value) : ordered;

  return (
    <div className="fd-volume-selector">
      <div className="fd-volume-selector__options" role="radiogroup" aria-label="Обʼєм">
        {visible.map((v) => {
          const oos = isOutOfStock(v);
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={value != null && v.volume_ml === value}
              aria-disabled={oos}
              disabled={oos}
              onClick={() => onChange(v.volume_ml)}
            >
              {v.volume_ml} ml
              {showOptionPrices && (
                <>
                  {' — '}
                  {formatPriceMinor(v.price_minor_uah)} {currency}
                </>
              )}
              {oos && <span className="fd-badge fd-badge--oos">{OOS_LABEL}</span>}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="fd-volume-selector__price" aria-live="polite">
          {formatPriceMinor(selected.price_minor_uah)} {currency}
        </p>
      )}
    </div>
  );
}

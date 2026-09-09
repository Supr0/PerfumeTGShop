/**
 * VolumeSheet — bottom-sheet volume picker for a catalog product.
 * Renders VolumeSelector with hideOutOfStock; picking an option calls
 * onPick immediately (no confirm button). Esc / backdrop call onClose
 * without picking. Never toasts — the page owner (Home) toasts on add.
 */
import { useEffect, useRef, useState } from 'react';
import { VolumeSelector } from './VolumeSelector';
import { isOutOfStock } from './ProductCard';
import type { Product } from './ProductCard';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';

interface VolumeSheetProps {
  product: Product;
  currency?: string;
  onPick: (productId: number, variantId: number) => void;
  onClose: () => void;
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: VolumeSheetLocale;
}

export type VolumeSheetLocale = 'uk' | 'ru';

const SHEET_STRINGS: Record<VolumeSheetLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

export function VolumeSheet({ product, currency = '₴', onPick, onClose, locale = 'uk' }: VolumeSheetProps) {
  const t = (key: string): string => SHEET_STRINGS[locale][key] ?? key;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<number>(() => {
    const sorted = [...product.variants].sort((a, b) => a.volume_ml - b.volume_ml);
    return (sorted.find((v) => !isOutOfStock(v)) ?? sorted[0])?.volume_ml ?? 0;
  });

  useEffect(() => {
    // Focus bookkeeping: focus the first selectable option on open,
    // return focus to the invoker on unmount/close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstOption = dialog?.querySelector<HTMLElement>('[role="radio"]:not([disabled])');
    (firstOption ?? dialog)?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const handleChange = (volumeMl: number) => {
    setValue(volumeMl);
    const variant = product.variants.find((v) => v.volume_ml === volumeMl);
    if (variant) onPick(product.id, variant.id);
  };

  return (
    <div
      ref={dialogRef}
      className="fd-volume-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      tabIndex={-1}
    >
      <div
        className="fd-volume-sheet__backdrop"
        data-testid="volume-sheet-backdrop"
        onClick={onClose}
      />
      <div className="fd-volume-sheet__body">
        <VolumeSelector
          variants={product.variants}
          value={value}
          onChange={handleChange}
          currency={currency}
          hideOutOfStock
        />
        <button type="button" onClick={onClose}>
          {t('sheet_close')}
        </button>
      </div>
    </div>
  );
}

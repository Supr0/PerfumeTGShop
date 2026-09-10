/**
 * VolumeSheet — bottom-sheet volume picker for a catalog product.
 * Renders VolumeSelector with hideOutOfStock; picking an option calls
 * onPick immediately (no confirm button). Esc / backdrop call onClose
 * without picking. Never toasts — the page owner (Home) toasts on add.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Close-animation window in ms — mirrors the CSS slide-down/fade duration. */
export const VOLUME_SHEET_CLOSE_MS = 200;

const SHEET_STRINGS: Record<VolumeSheetLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

export function VolumeSheet({ product, currency = '₴', onPick, onClose, locale = 'uk' }: VolumeSheetProps) {
  const t = (key: string): string => SHEET_STRINGS[locale][key] ?? key;
  const dialogRef = useRef<HTMLDivElement>(null);
  // Closing plays the slide-down/fade animation BEFORE the owner unmounts:
  // requestClose flips the closing class, then calls onClose after
  // VOLUME_SHEET_CLOSE_MS. Nothing is pre-selected — tap means pick.
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
    }, VOLUME_SHEET_CLOSE_MS);
  }, []);

  useEffect(() => {
    // Drop the pending close when the owner unmounts first
    // (e.g. pick already closed the sheet via onPick).
    return () => {
      if (closeTimerRef.current !== undefined) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Focus bookkeeping: focus the first selectable option on open,
    // return focus to the invoker on unmount/close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstOption = dialog?.querySelector<HTMLElement>('[role="radio"]:not([disabled])');
    (firstOption ?? dialog)?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [requestClose]);

  const handlePick = (volumeMl: number) => {
    const variant = product.variants.find((v) => v.volume_ml === volumeMl);
    if (!variant) return;
    if (isOutOfStock(variant)) return;
    onPick(product.id, variant.id);
    requestClose();
  };

  return (
    <div
      ref={dialogRef}
      className={closing ? 'fd-volume-sheet fd-volume-sheet--closing' : 'fd-volume-sheet'}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      tabIndex={-1}
    >
      <div
        className="fd-volume-sheet__backdrop"
        data-testid="volume-sheet-backdrop"
        onClick={requestClose}
      />
      <div className="fd-volume-sheet__body">
        <VolumeSelector
          variants={product.variants}
          value={null}
          onChange={handlePick}
          currency={currency}
          hideOutOfStock
          showOptionPrices
          locale={locale}
        />
        <button type="button" onClick={requestClose}>
          {t('sheet_close')}
        </button>
      </div>
    </div>
  );
}

import type { CSSProperties, ReactNode } from 'react';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';

export type FeedbackLocale = 'uk' | 'ru';

const FEEDBACK_STRINGS: Record<FeedbackLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  label?: string;
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: FeedbackLocale;
}

/** Placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height = 16, rounded = true, label, locale = 'uk' }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  return (
    <div
      className={`fd-skeleton${rounded ? ' fd-skeleton--rounded' : ''}`}
      style={style}
      role="status"
      aria-busy="true"
      aria-label={label ?? FEEDBACK_STRINGS[locale]['loading'] ?? 'loading'}
    />
  );
}

export type ToastKind = 'info' | 'success' | 'error';

interface ToastProps {
  message: string;
  kind?: ToastKind;
  action?: ReactNode;
}

/** Small floating notification. */
export function Toast({ message, kind = 'info', action }: ToastProps) {
  return (
    <div className={`fd-toast fd-toast--${kind}`} role="status" aria-live="polite">
      <span className="fd-toast__message">{message}</span>
      {action}
    </div>
  );
}

/** Single-source toast copy for a successful add-to-cart (UK default; pages use t('added_to_cart')). */
export const ADDED_TO_CART_LABEL: string = ukStrings['added_to_cart'] ?? 'added_to_cart';

interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: ReactNode;
}

/** Graceful empty state shared by catalog/cart/favorites lists. */
export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="fd-empty" role="status">
      <p className="fd-empty__title">{title}</p>
      {hint && <p className="fd-empty__hint">{hint}</p>}
      {action}
    </div>
  );
}

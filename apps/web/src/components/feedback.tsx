import type { CSSProperties, ReactNode } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  label?: string;
}

/** Placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height = 16, rounded = true, label }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  return (
    <div
      className={`fd-skeleton${rounded ? ' fd-skeleton--rounded' : ''}`}
      style={style}
      role="status"
      aria-busy="true"
      aria-label={label ?? 'Завантаження…'}
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

/** Single-source toast copy for a successful add-to-cart. */
export const ADDED_TO_CART_LABEL = 'Додано до кошика';

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

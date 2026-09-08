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

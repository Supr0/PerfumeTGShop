import { useEffect, useRef, useState } from 'react';
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

/** Default visible window in ms before the exit animation starts. */
export const TOAST_DURATION_MS = 2500;

/** Exit-animation window in ms — mirrors the CSS toast-out duration. */
export const TOAST_CLOSE_MS = 200;

interface ToastProps {
  message: string;
  kind?: ToastKind;
  action?: ReactNode;
  /** Visible window in ms — defaults to TOAST_DURATION_MS. Non-finite/negative falls back to the default so the toast can never stick. */
  durationMs?: number;
  /** Called once the exit animation finishes (or immediately under reduced motion). Optional — without it the toast hides itself so existing call sites dismiss unchanged. */
  onClose?: () => void;
}

/**
 * Small floating notification. Auto-dismisses after `durationMs` with a
 * short exit animation before `onClose`/unmount (closing-flag + timeout
 * pattern, cf. FilterSheet). A new `message` resets the timer so rapid
 * re-triggers replace content instead of stacking or sticking.
 */
export function Toast({ message, kind = 'info', action, durationMs = TOAST_DURATION_MS, onClose }: ToastProps) {
  const effectiveDuration =
    Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : TOAST_DURATION_MS;
  const [closing, setClosing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dismissTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const clearTimers = () => {
      if (dismissTimerRef.current !== undefined) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = undefined;
      }
      if (closeTimerRef.current !== undefined) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = undefined;
      }
    };
    // Re-trigger with a new message/duration restarts from the enter state.
    clearTimers();
    setClosing(false);
    setDismissed(false);
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      setDismissed(true);
      onCloseRef.current?.();
    };
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = undefined;
      if (reducedMotion) {
        finish();
        return;
      }
      setClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = undefined;
        finish();
      }, TOAST_CLOSE_MS);
    }, effectiveDuration);
    // Drop pending timers when the owner unmounts first.
    return clearTimers;
  }, [message, effectiveDuration]);

  if (dismissed) return null;
  return (
    <div
      className={closing ? `fd-toast fd-toast--${kind} fd-toast--closing` : `fd-toast fd-toast--${kind}`}
      role="status"
      aria-live="polite"
    >
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

/**
 * Telegram Mini App (TMA) helpers.
 *
 * Boots gracefully outside Telegram (dev browser fallback): every helper
 * is a safe no-op returning empty values when `window.Telegram.WebApp`
 * is absent. `authHeaders()` exposes the validated initData passthrough
 * to attach to every API request.
 */

export interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const HASH_PARAM = 'hash=';

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function isInsideTelegram(): boolean {
  return getTelegramWebApp() !== null;
}

/** Raw initData string; empty outside Telegram (dev fallback). */
export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
}

/**
 * Structural validation of initData (light client-side check).
 * Real authentication happens server-side; this only guards against
 * sending obviously malformed values.
 */
export function validateInitData(initData: string): boolean {
  if (!initData || initData.length === 0) return false;
  return initData.includes(HASH_PARAM);
}

/**
 * Headers carrying validated initData for API requests.
 * Returns an empty object when there is nothing valid to send.
 */
export function authHeaders(): Record<string, string> {
  const initData = getInitData();
  if (!validateInitData(initData)) return {};
  return { 'X-Telegram-Init-Data': initData };
}

/** Expand + signal ready; safe no-op outside Telegram. */
export function initTma(): void {
  const app = getTelegramWebApp();
  if (!app) return;
  try {
    app.expand();
    app.ready();
  } catch {
    // Telegram bridge unavailable — stay in dev fallback mode.
  }
}

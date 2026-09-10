/**
 * Checkout page: recipient + Nova Poshta delivery form, card-transfer
 * payment stub, idempotent order submit.
 *
 * Contract (Step 8 implements the backend in parallel — field names binding):
 * POST /v1/orders {name, phone, city, branch, comment, items:[{variant_id, qty}]}
 * with a fresh `Idempotency-Key: <crypto.randomUUID()>` header per attempt.
 * Totals are DISPLAY-ONLY — the server recomputes them, so no total field
 * is ever sent (see prior lesson).
 */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/tma';
import { parseOutOfStockVolumes, type OutOfStockVolume } from '../lib/api';
import { cartTotal, loadCart, persistCart, type CartState } from '../lib/cart';
import { Skeleton } from '../components/feedback';
import ukStrings from '../i18n/uk.json';
import ruStrings from '../i18n/ru.json';

export type CheckoutLocale = 'uk' | 'ru';

const CHECKOUT_STRINGS: Record<CheckoutLocale, Record<string, string>> = { uk: ukStrings, ru: ruStrings };

export const CHECKOUT_URL = '/v1/orders';
export const PUBLIC_SETTINGS_URL = '/v1/settings/public';
export const PAYMENT_LOADING_LABEL: string = ukStrings['payment_loading'] ?? 'payment_loading';
export const PAYMENT_FALLBACK_LABEL: string = ukStrings['payment_fallback'] ?? 'payment_fallback';
export const SELLER_HREF = 'https://t.me/freshdoze_catalog_bot';

export const NAME_MAX = 80;
export const CITY_MAX = 120;
export const BRANCH_MAX = 120;
export const COMMENT_MAX = 500;

export const PHONE_ERROR: string = ukStrings['err_phone'] ?? 'err_phone';

/** Wave: NP directory API — replace with the live directory, keep free-text fallback. */
export const CITIES = ['Львів', 'Київ', 'Одеса', 'Дніпро', 'Харків'];
/** Wave: NP directory API — sample branch labels, free-text entry stays allowed. */
export const BRANCHES = ['Відділення №1', 'Відділення №2', 'Відділення №3'];

interface PublicSettings {
  dispatch_city: string;
  card_requisites: string;
  payment_enabled: boolean;
}

export interface OrderApiResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type FetchImpl = (input: string, init?: RequestInit) => Promise<OrderApiResponse>;

const defaultFetch: FetchImpl = (input, init) => fetch(input, init);

/** Strip spaces/dashes/parens before the server-shape check. */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[\s\-()]/g, '');
}

/** Server rule mirror: ^\+380\d{9}$ on the normalized value. */
export function isValidPhoneNumber(normalized: string): boolean {
  return /^\+380\d{9}$/.test(normalized);
}

/** Fresh idempotency key per submit attempt (no double-tap replays). */
export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // WebCrypto unavailable — fall through to the Math.random fallback.
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface CheckoutForm {
  name: string;
  phone: string;
  city: string;
  branch: string;
  comment: string;
}

export interface CheckoutItem {
  variant_id: number;
  qty: number;
}

/** Request body builder — note the absence of any total field by design. */
export function buildCheckoutBody(
  items: CartState,
  form: CheckoutForm,
): { name: string; phone: string; city: string; branch: string; comment: string; items: CheckoutItem[] } {
  return {
    name: form.name.trim(),
    phone: normalizePhoneNumber(form.phone),
    city: form.city.trim(),
    branch: form.branch.trim(),
    comment: form.comment.trim(),
    items: items.map((line) => ({ variant_id: line.variantId, qty: line.qty })),
  };
}

type FieldErrors = Partial<Record<'name' | 'phone' | 'city' | 'branch' | 'comment', string>>;

function validateForm(form: CheckoutForm, t: (key: string) => string): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = t('err_name_required');
  else if (name.length > NAME_MAX) errors.name = t('err_name_max').replace('{max}', String(NAME_MAX));
  if (!isValidPhoneNumber(normalizePhoneNumber(form.phone))) errors.phone = t('err_phone');
  const city = form.city.trim();
  if (city === '') errors.city = t('err_city_required');
  else if (city.length > CITY_MAX) errors.city = t('err_city_max').replace('{max}', String(CITY_MAX));
  const branch = form.branch.trim();
  if (branch === '') errors.branch = t('err_branch_required');
  else if (branch.length > BRANCH_MAX) errors.branch = t('err_branch_max').replace('{max}', String(BRANCH_MAX));
  if (form.comment.trim().length > COMMENT_MAX)
    errors.comment = t('err_comment_max').replace('{max}', String(COMMENT_MAX));
  return errors;
}

/** FastAPI 422 payload → per-field messages; returns null when not field-shaped. */
function parseFieldErrors(payload: unknown): string[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') return [detail];
  if (!Array.isArray(detail)) return null;
  const messages: string[] = [];
  for (const entry of detail) {
    if (typeof entry === 'object' && entry !== null && 'msg' in entry) {
      const msg = (entry as { msg: unknown }).msg;
      if (typeof msg === 'string') messages.push(msg);
    } else if (typeof entry === 'string') {
      messages.push(entry);
    }
  }
  return messages.length > 0 ? messages : null;
}

interface CheckoutProps {
  fetchImpl?: FetchImpl;
  checkoutUrl?: string;
  settingsUrl?: string;
  /** Test seam — defaults to the real cart store. */
  initialItems?: CartState;
  /** UI locale — mirrors the App shell switcher; defaults to UK. */
  locale?: CheckoutLocale;
}

export default function Checkout({
  fetchImpl = defaultFetch,
  checkoutUrl = CHECKOUT_URL,
  settingsUrl = PUBLIC_SETTINGS_URL,
  initialItems,
  locale = 'uk',
}: CheckoutProps) {
  const t = (key: string): string => CHECKOUT_STRINGS[locale][key] ?? key;
  const [items] = useState<CartState>(() => initialItems ?? loadCart());
  const [form, setForm] = useState<CheckoutForm>({ name: '', phone: '', city: t('default_city'), branch: '', comment: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outOfStock, setOutOfStock] = useState(false);
  const [outOfStockVolumes, setOutOfStockVolumes] = useState<OutOfStockVolume[]>([]);
  const [serverMessages, setServerMessages] = useState<string[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [requisites, setRequisites] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchImpl(settingsUrl, { headers: { ...authHeaders() } });
        if (!res.ok) {
          if (!cancelled) setPaymentStatus('error');
          return;
        }
        const payload = (await res.json().catch(() => null)) as Partial<PublicSettings> | null;
        const text = typeof payload?.card_requisites === 'string' ? payload.card_requisites.trim() : '';
        if (!cancelled) {
          if (text !== '') {
            setRequisites(text);
            setPaymentStatus('ready');
          } else {
            setPaymentStatus('error');
          }
        }
      } catch {
        if (!cancelled) setPaymentStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchImpl, settingsUrl]);

  const set = (key: keyof CheckoutForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  if (orderNumber !== null) {
    return (
      <section className="fd-checkout fd-checkout--done" aria-label={t('checkout_done_section')}>
        <h1>{t('checkout_done_title').replace('{number}', orderNumber)}</h1>
        <p>{t('checkout_done_hint')}</p>
        <a href="#/orders">{t('checkout_done_orders')}</a>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="fd-checkout" aria-label={t('checkout_title')}>
        <h1>{t('checkout_title')}</h1>
        <p>{t('checkout_empty')}</p>
        <a href="#/">{t('checkout_to_catalog')}</a>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const nextErrors = validateForm(form, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setPending(true);
    setSubmitError(null);
    setOutOfStock(false);
    setOutOfStockVolumes([]);
    setServerMessages([]);
    const idempotencyKey = newIdempotencyKey();
    try {
      const res = await fetchImpl(checkoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(), 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(buildCheckoutBody(items, form)),
      });
      const payload: unknown = await res.json().catch(() => null);
      // Success = 201/200 AND a real order-number string; anything else is
      // an error path that must NOT wipe the cart (prior lesson).
      const number =
        typeof payload === 'object' &&
        payload !== null &&
        'number' in payload &&
        typeof (payload as { number: unknown }).number === 'string'
          ? (payload as { number: string }).number
          : null;
      if ((res.status === 201 || res.status === 200) && number !== null) {
        persistCart([]);
        setOrderNumber(number);
        return;
      }
      if (res.status === 409) {
        // Real server shape: {detail:"out_of_stock", volumes:[{variant_id, ml, stock}]}.
        const volumes = parseOutOfStockVolumes(payload);
        setOutOfStockVolumes(volumes);
        setSubmitError(t('out_of_stock'));
        setOutOfStock(true);
        return;
      }
      if (res.status === 422) {
        const messages = parseFieldErrors(payload);
        if (messages) {
          setServerMessages(messages);
          return;
        }
      }
      setSubmitError(t('checkout_failed'));
    } catch {
      setSubmitError(t('checkout_failed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="fd-checkout" aria-label={t('checkout_title')}>
      <h1>{t('checkout_title')}</h1>
      <p>
        {t('checkout_total').replace('{total}', String(cartTotal(items)))}
      </p>
      <form onSubmit={submit} noValidate>
        <div>
          <label htmlFor="fd-name">{t('field_name')}</label>
          <input id="fd-name" value={form.name} onChange={set('name')} maxLength={NAME_MAX} />
          {errors.name && <p role="alert">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="fd-phone">{t('field_phone')}</label>
          <input
            id="fd-phone"
            inputMode="tel"
            placeholder={t('phone_placeholder')}
            value={form.phone}
            onChange={set('phone')}
          />
          {errors.phone && <p role="alert">{errors.phone}</p>}
        </div>
        <div>
          <label htmlFor="fd-city">{t('field_city')}</label>
          <input id="fd-city" list="fd-checkout-cities" value={form.city} onChange={set('city')} maxLength={CITY_MAX} />
          <datalist id="fd-checkout-cities">
            {CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {errors.city && <p role="alert">{errors.city}</p>}
        </div>
        <div>
          <label htmlFor="fd-branch">{t('field_branch')}</label>
          <input
            id="fd-branch"
            list="fd-checkout-branches"
            value={form.branch}
            onChange={set('branch')}
            maxLength={BRANCH_MAX}
          />
          <datalist id="fd-checkout-branches">
            {BRANCHES.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          {errors.branch && <p role="alert">{errors.branch}</p>}
        </div>
        <div>
          <label htmlFor="fd-comment">{t('field_comment')}</label>
          <textarea id="fd-comment" value={form.comment} onChange={set('comment')} maxLength={COMMENT_MAX + 50} />
          {errors.comment && <p role="alert">{errors.comment}</p>}
        </div>
        <section className="fd-checkout__payment" aria-label={t('payment_title')}>
          <h2>{t('payment_title')}</h2>
          <p>{t('payment_card')}</p>
          {paymentStatus === 'loading' ? (
            <Skeleton height={16} label={t('payment_loading')} locale={locale} />
          ) : paymentStatus === 'error' ? (
            <>
              <p>{t('payment_fallback')}</p>
              <a href={SELLER_HREF} target="_blank" rel="noreferrer">
                {t('seller_chat')}
              </a>
            </>
          ) : (
            requisites !== null && <p>{requisites}</p>
          )}
          <p>{t('payment_delivery')}</p>
        </section>
        {serverMessages.length > 0 && (
          <div role="alert">
            {serverMessages.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        {submitError && <p role="alert">{submitError}</p>}
        {outOfStock && outOfStockVolumes.length > 0 && (
          <ul aria-label={t('oos_volumes_label')}>
            {outOfStockVolumes.map((v) => (
              <li key={v.variant_id}>
                {v.stock <= 0
                  ? t('oos_row_none').replace('{ml}', String(v.ml))
                  : t('oos_row_left').replace('{ml}', String(v.ml)).replace('{stock}', String(v.stock))}
              </li>
            ))}
          </ul>
        )}
        {outOfStock && <a href="#/cart">{t('checkout_back_to_cart')}</a>}
        <button type="submit" disabled={pending}>
          {t('checkout_submit')}
        </button>
      </form>
    </section>
  );
}

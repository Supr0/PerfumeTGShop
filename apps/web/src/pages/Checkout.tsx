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
import { useState } from 'react';
import { authHeaders } from '../lib/tma';
import { cartTotal, loadCart, persistCart, type CartState } from '../lib/cart';

export const CHECKOUT_URL = '/v1/orders';

export const NAME_MAX = 80;
export const CITY_MAX = 120;
export const BRANCH_MAX = 120;
export const COMMENT_MAX = 500;

export const PHONE_ERROR = 'Введіть номер у форматі +380…';

/** Wave: NP directory API — replace with the live directory, keep free-text fallback. */
export const CITIES = ['Львів', 'Київ', 'Одеса', 'Дніпро', 'Харків'];
/** Wave: NP directory API — sample branch labels, free-text entry stays allowed. */
export const BRANCHES = ['Відділення №1', 'Відділення №2', 'Відділення №3'];

// TODO: render requisites from GET /settings/public — Wave: wire to API.
export const PAYMENT_REQUISITES_STUB =
  "Реквізити для переказу на картку з'являться з /settings/public — Wave: wire to API";

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

function validateForm(form: CheckoutForm): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = "Введіть ім'я";
  else if (name.length > NAME_MAX) errors.name = `Ім'я має бути до ${NAME_MAX} символів`;
  if (!isValidPhoneNumber(normalizePhoneNumber(form.phone))) errors.phone = PHONE_ERROR;
  const city = form.city.trim();
  if (city === '') errors.city = 'Введіть місто';
  else if (city.length > CITY_MAX) errors.city = `Місто має бути до ${CITY_MAX} символів`;
  const branch = form.branch.trim();
  if (branch === '') errors.branch = 'Введіть відділення';
  else if (branch.length > BRANCH_MAX) errors.branch = `Відділення має бути до ${BRANCH_MAX} символів`;
  if (form.comment.trim().length > COMMENT_MAX)
    errors.comment = `Коментар має бути до ${COMMENT_MAX} символів`;
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
  /** Test seam — defaults to the real cart store. */
  initialItems?: CartState;
}

export default function Checkout({ fetchImpl = defaultFetch, checkoutUrl = CHECKOUT_URL, initialItems }: CheckoutProps) {
  const [items] = useState<CartState>(() => initialItems ?? loadCart());
  const [form, setForm] = useState<CheckoutForm>({ name: '', phone: '', city: 'Львів', branch: '', comment: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outOfStock, setOutOfStock] = useState(false);
  const [serverMessages, setServerMessages] = useState<string[]>([]);

  const set = (key: keyof CheckoutForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  if (orderNumber !== null) {
    return (
      <section aria-label="Замовлення оформлено">
        <h1>{`Дякуємо! Замовлення №${orderNumber}`}</h1>
        <p>Ми напишемо вам для підтвердження оплати.</p>
        <a href="/orders">Мої замовлення</a>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section aria-label="Оформлення замовлення">
        <h1>Оформлення замовлення</h1>
        <p>Кошик порожній</p>
        <a href="/">До каталогу</a>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setPending(true);
    setSubmitError(null);
    setOutOfStock(false);
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
        const detail =
          typeof payload === 'object' && payload !== null && 'detail' in payload
            ? String((payload as { detail: unknown }).detail)
            : '';
        setSubmitError(`Немає в наявності${detail !== '' ? `: ${detail}` : ''}`);
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
      setSubmitError('Не вдалося оформити замовлення. Спробуйте ще.');
    } catch {
      setSubmitError('Не вдалося оформити замовлення. Спробуйте ще.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-label="Оформлення замовлення">
      <h1>Оформлення замовлення</h1>
      <p>
        {`Разом до сплати (орієнтовно): ${cartTotal(items)} ₴`}
      </p>
      <form onSubmit={submit} noValidate>
        <div>
          <label htmlFor="fd-name">{"Ім'я"}</label>
          <input id="fd-name" value={form.name} onChange={set('name')} maxLength={NAME_MAX} />
          {errors.name && <p role="alert">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="fd-phone">Телефон</label>
          <input
            id="fd-phone"
            inputMode="tel"
            placeholder="+380…"
            value={form.phone}
            onChange={set('phone')}
          />
          {errors.phone && <p role="alert">{errors.phone}</p>}
        </div>
        <div>
          <label htmlFor="fd-city">Місто</label>
          <input id="fd-city" list="fd-checkout-cities" value={form.city} onChange={set('city')} maxLength={CITY_MAX} />
          <datalist id="fd-checkout-cities">
            {CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {errors.city && <p role="alert">{errors.city}</p>}
        </div>
        <div>
          <label htmlFor="fd-branch">Відділення (Нова пошта)</label>
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
          <label htmlFor="fd-comment">Коментар (необов’язково)</label>
          <textarea id="fd-comment" value={form.comment} onChange={set('comment')} maxLength={COMMENT_MAX + 50} />
          {errors.comment && <p role="alert">{errors.comment}</p>}
        </div>
        <section aria-label="Оплата">
          <h2>Оплата</h2>
          <p>Оплата — переказом на картку.</p>
          <p>{PAYMENT_REQUISITES_STUB}</p>
          <p>Доставку сплачує покупець.</p>
        </section>
        {serverMessages.length > 0 && (
          <div role="alert">
            {serverMessages.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        {submitError && <p role="alert">{submitError}</p>}
        {outOfStock && <a href="/cart">Повернутися до кошика</a>}
        <button type="submit" disabled={pending}>
          Підтвердити замовлення
        </button>
      </form>
    </section>
  );
}

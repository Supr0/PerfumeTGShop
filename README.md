# FreshDoze — Telegram Mini App for a decant perfume shop

A production-oriented Telegram Mini App for selling perfumes by decant volume (3 / 5 / 10 ml):
catalog with faceted filters, per-volume pricing, guest cart, server-authoritative checkout,
order tracking, and an in-app admin panel — in Ukrainian and Russian.

Built as a portfolio project: small footprint, no UI framework, no state-management library,
no ORM magic — just React + FastAPI + Postgres, with the trust boundaries of a real shop
(Telegram `initData` verification, server-side price/stock validation, idempotent orders).

<p>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Postgres" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-104%20API%20%2B%20216%20UI-brightgreen">
</p>

## Screenshots

| Catalog | Product | Cart |
| --- | --- | --- |
| ![Catalog](docs/screenshots/01-catalog.png) | ![Product](docs/screenshots/02-product.png) | ![Cart](docs/screenshots/03-cart.png) |

| Checkout | Orders | Admin |
| --- | --- | --- |
| ![Checkout](docs/screenshots/04-checkout.png) | ![Orders](docs/screenshots/05-orders.png) | ![Admin](docs/screenshots/06-admin.png) |

<sub>Screenshots were captured from the real UI at 390×844 @2× with a signed Telegram `initData`
stub. Product photos are placeholders — the demo catalog is generated, so brands carry a
`(demo)` suffix.</sub>

## Features

**Storefront**
- Catalog with server-side filtering (brand, scent family, gender, season, price, availability),
  sorting, full-text-ish search, and pagination.
- Three prices per product (3 / 5 / 10 ml) visible right on the card — no extra tap to compare.
- Whole-card tap opens the product page; the `+` button opens a volume sheet with only
  in-stock options and per-option prices (tap = add, no confirmation step).
- Product page: volume switcher with live price, notes pyramid, characteristics, similar scents.
- Favourites (local-only, per Telegram user), guest cart persisted across sessions.
- Cart: change volume in place (quantity preserved), change quantity, out-of-stock volumes hidden,
  moving a line onto a volume already in the cart is rejected with a clear notice instead of
  silently duplicating lines.

**Checkout & orders**
- Single-step checkout: name, `+380…` phone (normalised + validated server-side), city and
  Nova Poshta branch (suggestions + free text), comment.
- **Server-authoritative totals**: the request body has no `total` field at all; prices are
  recomputed from the database and stock is decremented atomically (`UPDATE … WHERE stock >= qty`).
- `Idempotency-Key` per checkout attempt, scoped to the buyer, race-safe — a double tap or a
  retried request returns the same order instead of creating a duplicate.
- Order history with statuses and TTN, best-effort Telegram notification to admins
  (notification failures never roll back an order).

**Admin (inside the same Mini App)**
- Gated by a server-side allowlist (`ADMIN_IDS` env ∪ DB list); every admin route requires it.
- Products CRUD (prices, stock, photo URL, old price, hit flag), order status transitions with
  TTN, shop settings (dispatch city, card requisites, payment-provider key + flag), promo flag.
- Admin is only rendered after `/v1/admin/me` succeeds — the tab is not a client-side secret,
  the API is what protects it.

**UX / i18n**
- Ukrainian by default, Russian switch persisted; every visible string, including admin forms
  and validation errors, goes through the dictionaries (a parity test keeps both in sync).
- Bottom sheets with real open/close animations, toast auto-dismiss, skeleton loaders, empty
  states, swipe navigation between main tabs, `prefers-reduced-motion` respected.

## Architecture

```mermaid
flowchart LR
    TG[Telegram client] -->|Mini App iframe| NG[nginx<br/>static + SPA fallback]
    NG -->|/v1/* proxy| API[FastAPI]
    API -->|async SQLAlchemy| PG[(Postgres)]
    API -->|best-effort sendMessage| BOT[Telegram Bot API]
    API -.->|HMAC verify initData| TG
```

- **One origin.** nginx serves the built SPA and proxies `/v1/*` to the API, so the Mini App can
  make same-origin requests and the API needs no CORS.
- **Auth without sessions.** Every protected request carries `X-Telegram-Init-Data`; the API
  validates the HMAC (`secret = HMAC_SHA256("WebAppData", bot_token)`, fields sorted as `k=v`,
  `hmac.compare_digest`) and rejects stale payloads (`auth_date` older than 1 hour). The Telegram
  user id is taken **only** from the validated payload — never from the client's own claims.
- **Guests are first-class.** Cart and favourites live in `localStorage` namespaced by the
  verified Telegram id; checkout is the only place a server record is created.

### Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | React 18 + Vite 5 + TypeScript (strict) | no router/state/UI libraries |
| Styling | one hand-written `index.css` | design tokens, light theme, mobile-first |
| API | FastAPI (async) | Pydantic v2 schemas, `yield` session dependency |
| DB | PostgreSQL 16 + SQLAlchemy 2.0 async | Alembic migrations |
| Bot | stdlib-only notifier | MarkdownV2-escaped, never raises |
| Tests | pytest + httpx, Vitest + Testing Library | 104 backend, 216 frontend |

## Project layout

```
apps/
  api/               FastAPI app, routers, schemas, models, services, tests
  web/               Mini App (React + Vite), nginx config, Dockerfile
  bot/               order-notification formatter/sender (stdlib only)
packages/seed/       deterministic demo catalog generator + upsert loader
alembic/             async migration environment + initial schema
deploy/nginx.conf    symlink to apps/web/nginx.conf (canonical file)
docker-compose.yml   development stack (hot reload, port 8000/5432 published)
docker-compose.prod.yml  production stack (nginx + api + db, migrations on boot)
```

## Getting started (local development)

Requirements: Python 3.11+, Node 20+, Docker (for the database).

```bash
cp .env.example .env          # set BOT_TOKEN and ADMIN_IDS
docker compose up -d db       # Postgres on localhost:5432

python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt

export DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/perfume
alembic upgrade head
python packages/seed/load.py --count 200   # demo catalog

uvicorn apps.api.main:app --reload --port 8000
```

In a second terminal:

```bash
cd apps/web
npm ci
npm run dev        # http://localhost:5173 — /v1 and /healthz are proxied to :8000
```

> The Mini App expects Telegram's `initData`. For browser-only development it still renders the
> catalog (read-only requests are public); to exercise cart/checkout/admin, open it from Telegram
> as described below, or inject a signed `initData` stub in the browser console.

### Wiring it to Telegram

1. `@BotFather` → your bot → **Bot Settings → Menu Button** → set the public URL.
2. If BotFather asks for a domain: `/setdomain` → your host.
3. Serve the app over **HTTPS** — Telegram requires it.

## Production (Docker)

`docker-compose.prod.yml` runs three containers: `db` (Postgres, not published), `api`
(non-root, migrations + uvicorn), `web` (nginx-unprivileged serving the built SPA and proxying
`/v1`). TLS is terminated **outside** the stack (Caddy, Traefik, nginx, or a cloud load balancer) —
nothing certificate-related is baked into the images.

```bash
# POSTGRES_PASSWORD is required; HTTP_PORT defaults to 80, WEB_CONCURRENCY to 2
POSTGRES_PASSWORD='<strong-password>' HTTP_PORT=80 \
  docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost/healthz     # {"status":"ok"}
```

On container start the API runs `alembic upgrade head` before serving traffic, so schema changes
ship with the image. Data lives in the `pgdata` volume.

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `BOT_TOKEN` | yes | — | Telegram bot token; also the HMAC key source for `initData` |
| `ADMIN_IDS` | yes | `[]` | Admin Telegram user ids — `"918312403"`, `"1,2"` or `"[1,2]"` all accepted |
| `DATABASE_URL` | yes | `postgresql+asyncpg://…@db/perfume` | Async SQLAlchemy URL |
| `POSTGRES_PASSWORD` | prod only | — | Compose interpolation; URL-encode special characters |
| `HTTP_PORT` | no | `80` | Published port for the nginx container |
| `WEB_CONCURRENCY` | no | `2` | uvicorn worker count |

Secrets are read from the environment / a host `.env` (git-ignored). Nothing is hardcoded, and
provider keys are never serialised to public endpoints.

## API

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/healthz` | public | liveness probe |
| `GET` | `/v1/catalog` | public | filtered/sorted/paginated catalog |
| `GET` | `/v1/products/{id}` | public | product detail |
| `POST` | `/v1/orders` | Telegram user | create order (`Idempotency-Key` required) |
| `GET` | `/v1/orders/mine` | Telegram user | own order history |
| `GET` | `/v1/orders/{number}` | owner or admin | single order |
| `GET` | `/v1/settings/public` | public | dispatch city, card requisites, payment flag |
| `GET` | `/v1/admin/me` | admin | admin probe used to gate the UI tab |
| `GET/POST/PUT/DELETE` | `/v1/admin/products…` | admin | product management |
| `GET/PATCH` | `/v1/admin/orders…` | admin | order list, statuses, TTN |
| `GET/PUT` | `/v1/admin/settings` | admin | shop settings |
| `PUT` | `/v1/admin/promos` | admin | promo flag |

Full interactive docs: `http://localhost:8000/docs`.

## Testing

```bash
# API + seed package
PYTHONPATH=. pytest apps/api/tests packages/seed -q    # 104 passed

# Mini App
cd apps/web && npm run typecheck && npx vitest run     # 216 passed, 17 files
```

The suites cover the parts that are easy to get wrong: `initData` signature vectors (including an
independently generated spec vector), stale `auth_date`, price tampering, stock races, idempotent
replays, owner-vs-admin access, the full admin route allowlist, cart invariants, sheet/toast
lifecycle, dictionary parity, and RU rendering.

## Design decisions & trade-offs

- **No UI kit.** A perfume shop is a showcase product; a hand-built stylesheet keeps the visual
  language consistent and the bundle small (~200 kB JS, ~17 kB CSS).
- **Prices per volume as rows, not SKUs.** `ProductVariant(volume_ml, price, stock)` with a DB
  `CHECK (volume_ml IN (3,5,10))` keeps three "sizes" of one scent together and makes
  "from 195 ₴" trivially derivable.
- **No cart reservation.** Stock is verified and decremented atomically at checkout; overselling is
  impossible, but a cart line can go out of stock between add and checkout — the UI then shows a
  per-volume 409 with what is actually left.
- **Manual card transfer first.** The payment layer is an interface with a disabled provider stub
  (LiqPay / WayForPay / Mono); the store ships with card requisites instead of an unnecessary
  acquiring integration.
- **Notifications, not a command bot.** The API sends the order card itself; there is no polling
  process to keep alive. A conversational bot can be added later without touching this flow.
- **Admin inside the Mini App.** One deployment, one design language, and the allowlist check
  lives on the server where it matters.

## Known limitations / roadmap

- Demo catalog only: 200 generated products with placeholder images; importing a real supplier
  spreadsheet is a follow-up.
- Nova Poshta branches come from a small static list with free-text fallback (no API key required
  for the demo).
- Payments are manual card transfers; the provider stub is intentionally disabled.
- No reviews, bonuses, analytics, or push campaigns — deliberately out of scope for the demo.
- No end-to-end browser suite yet; UI behaviour is covered by component tests.

## License

Demo / portfolio project. Product names used by the generated catalog are fictional or marked
`(demo)`; no affiliation with the brands mentioned.

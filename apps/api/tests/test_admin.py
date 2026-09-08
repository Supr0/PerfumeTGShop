"""Admin surface tests (R-08,R-09,R-16,R-17) + checkout body contract (FIX-0).

Admin contract under test (routers prefix /v1/admin, require_admin on EVERY
route — validated initData id in env ADMIN_IDS UNION DB Setting admin_ids):
  GET /me -> 200 admin / 403 otherwise
  GET/POST /products, PUT/DELETE /products/{id} (variants volume in {3,5,10})
  GET /orders[?status], PATCH /orders/{number} (guarded transitions:
    new->confirmed->shipped->delivered, any->cancelled, else 422) + ttn
  GET/PUT /settings (dispatch_city, card_requisites, provider key + flag
    default false, usernames ^[A-Za-z0-9_]{5,32}$ each, <=20)
  PUT /promos {id, is_active}

Checkout contract proof (FIX-0): the exact body Checkout.tsx sends
({name,phone,city,branch,comment,items}, header-only Idempotency-Key)
validates against OrderCreate; bodies with `total`/`idempotency_key` are 422.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlencode

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import StaticPool
from unittest.mock import AsyncMock, patch

from apps.api.core.config import settings
from apps.api.db.session import Base, get_session
from apps.api.models.misc import Promo, Setting
from apps.api.models.product import Product, ProductVariant
from apps.api.routers.admin import router as admin_router
from apps.api.routers.settings import router as settings_router
from apps.api.schemas.orders import OrderCreate

pytestmark = pytest.mark.anyio

BOT_TOKEN = "123456:TEST-TOKEN_abcdef"
ADMIN_ID = 918312403
OTHER_ADMIN = 777777777
USER = 111111111


def _sign(fields: dict[str, str], bot_token: str = BOT_TOKEN) -> str:
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    return hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()


def _auth_header(tg_id: int) -> dict[str, str]:
    fields = {
        "auth_date": str(int(time.time())),
        "query_id": "AAETESTQUERY",
        "user": json.dumps({"id": tg_id, "first_name": "Test"}),
    }
    signed = dict(fields)
    signed["hash"] = _sign(fields)
    return {"X-Telegram-Init-Data": urlencode(signed)}


@asynccontextmanager
async def _client() -> AsyncIterator[tuple[AsyncClient, async_sessionmaker]]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        product = Product(name="Admin aroma", brand="Test", is_active=True)
        product.variants = [ProductVariant(volume_ml=5, price_minor_uah=10000, stock=9)]
        session.add(product)
        promo = Promo(title="Sale", text="up to -20%", is_active=False)
        session.add(promo)
        session.add(Setting(key="admin_ids", value=json.dumps([OTHER_ADMIN])))
        await session.commit()
        product_id = product.id
        variant_id = product.variants[0].id
        promo_id = promo.id

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    settings.bot_token = BOT_TOKEN
    settings.admin_ids = [ADMIN_ID]

    app = FastAPI()
    app.include_router(admin_router)
    app.include_router(settings_router)
    app.dependency_overrides[get_session] = _override
    with patch(
        "apps.api.services.notify.notify_new_order",
        new=AsyncMock(return_value=True),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.headers.update({})
            yield client, maker
    await engine.dispose()
    _ = (product_id, variant_id, promo_id)


async def _seed_ids(client: AsyncClient, maker: async_sessionmaker) -> dict[str, int]:
    async with maker() as session:
        product = (
            await session.execute(select(Product).options(selectinload(Product.variants)))
        ).scalars().first()
        assert product is not None
        promo = (await session.execute(select(Promo))).scalars().first()
        assert promo is not None
        return {
            "product_id": product.id,
            "variant_id": product.variants[0].id if product.variants else 0,
            "promo_id": promo.id,
        }


def _product_payload(**overrides: object) -> dict:
    payload: dict = {
        "name": "New aroma",
        "brand": "Brand",
        "image": "https://cdn.example/p.jpg",
        "is_active": True,
        "is_hit": False,
        "variants": [
            {"volume_ml": 5, "price_minor_uah": 12000, "old_price_minor_uah": 15000, "stock": 4}
        ],
    }
    payload.update(overrides)
    return payload


async def _create_order_direct(maker: async_sessionmaker, number: str, status: str = "new") -> str:
    from apps.api.models.order import Order, OrderItem

    async with maker() as session:
        product = (
            await session.execute(select(Product).options(selectinload(Product.variants)))
        ).scalars().first()
        assert product is not None
        order = Order(
            number=number,
            owner_tg_id=USER,
            idempotency_key=str(uuid.uuid4()),
            status=status,  # type: ignore[arg-type]
            name="Buyer",
            phone="+380501234567",
            city="Львів",
            branch="Відділення №1",
            total_minor_uah=10000,
        )
        order.items.append(
            OrderItem(variant_id=product.variants[0].id, qty=1, price_minor_uah=10000)
        )
        session.add(order)
        await session.commit()
        return order.number


# --- require_admin: non-admin 403 on EACH endpoint (parametrized) ---

ADMIN_GET_ROUTES = [
    "/v1/admin/me",
    "/v1/admin/products",
    "/v1/admin/orders",
    "/v1/admin/settings",
]


@pytest.mark.parametrize("route", ADMIN_GET_ROUTES)
async def test_non_admin_get_403(route: str) -> None:
    async with _client() as (client, _maker):
        resp = await client.get(route, headers=_auth_header(USER))
    assert resp.status_code == 403


@pytest.mark.parametrize(
    ("method", "route", "payload"),
    [
        ("post", "/v1/admin/products", None),
        ("put", "/v1/admin/products/1", None),
        ("delete", "/v1/admin/products/1", None),
        ("patch", "/v1/admin/orders/AAAAAAAA", None),
        ("put", "/v1/admin/settings", None),
        ("put", "/v1/admin/promos", None),
    ],
)
async def test_non_admin_write_403(method: str, route: str, payload: object) -> None:
    async with _client() as (client, _maker):
        body: dict = {}
        if "products" in route and method in ("post", "put"):
            body = _product_payload()
        elif "settings" in route:
            body = {"dispatch_city": "Київ"}
        elif "promos" in route:
            body = {"id": 1, "is_active": True}
        elif "orders" in route:
            body = {"ttn": "123"}
        func = getattr(client, method)
        if method == "delete":
            resp = await func(route, headers=_auth_header(USER))
        else:
            resp = await func(route, json=body, headers=_auth_header(USER))
    assert resp.status_code == 403
    _ = payload


async def test_missing_init_data_403() -> None:
    async with _client() as (client, _maker):
        resp = await client.get("/v1/admin/me")
    assert resp.status_code == 403


async def test_me_200_for_env_and_db_admins() -> None:
    async with _client() as (client, _maker):
        env_admin = await client.get("/v1/admin/me", headers=_auth_header(ADMIN_ID))
        db_admin = await client.get("/v1/admin/me", headers=_auth_header(OTHER_ADMIN))
    assert env_admin.status_code == 200
    assert env_admin.json() == {"is_admin": True, "tg_id": ADMIN_ID}
    assert db_admin.status_code == 200


# --- products ---


async def test_product_crud_round_trip() -> None:
    async with _client() as (client, maker):
        ids = await _seed_ids(client, maker)
        created = await client.post(
            "/v1/admin/products", json=_product_payload(), headers=_auth_header(ADMIN_ID)
        )
        assert created.status_code == 201
        new_id = created.json()["id"]
        assert created.json()["variants"][0]["volume_ml"] == 5

        updated = await client.put(
            f"/v1/admin/products/{new_id}",
            json={"is_hit": True, "image": "https://cdn.example/q.jpg"},
            headers=_auth_header(ADMIN_ID),
        )
        assert updated.status_code == 200
        assert updated.json()["is_hit"] is True

        listed = await client.get("/v1/admin/products", headers=_auth_header(ADMIN_ID))
        assert listed.status_code == 200
        assert {p["id"] for p in listed.json()} >= {ids["product_id"], new_id}

        deleted = await client.delete(
            f"/v1/admin/products/{new_id}", headers=_auth_header(ADMIN_ID)
        )
        assert deleted.status_code == 204


async def test_product_bad_volume_422() -> None:
    async with _client() as (client, _maker):
        resp = await client.post(
            "/v1/admin/products",
            json=_product_payload(variants=[{"volume_ml": 50, "price_minor_uah": 1, "stock": 1}]),
            headers=_auth_header(ADMIN_ID),
        )
    assert resp.status_code == 422


# --- orders ---


async def test_order_status_chain_and_ttn() -> None:
    async with _client() as (client, maker):
        number = await _create_order_direct(maker, "CHAIN001")
        for next_status in ("confirmed", "shipped", "delivered"):
            resp = await client.patch(
                f"/v1/admin/orders/{number}",
                json={"status": next_status},
                headers=_auth_header(ADMIN_ID),
            )
            assert resp.status_code == 200, resp.text
            assert resp.json()["status"] == next_status
        ttn = await client.patch(
            f"/v1/admin/orders/{number}",
            json={"ttn": "20400012345678"},
            headers=_auth_header(ADMIN_ID),
        )
        assert ttn.status_code == 200
        assert ttn.json()["ttn"] == "20400012345678"


async def test_order_cancel_from_any() -> None:
    async with _client() as (client, maker):
        number = await _create_order_direct(maker, "CANCEL01")
        resp = await client.patch(
            f"/v1/admin/orders/{number}",
            json={"status": "cancelled"},
            headers=_auth_header(ADMIN_ID),
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


@pytest.mark.parametrize("bad", ["shipped", "delivered"])
async def test_order_bad_transition_422(bad: str) -> None:
    async with _client() as (client, maker):
        number = await _create_order_direct(maker, f"BAD{bad.upper()}1")
        resp = await client.patch(
            f"/v1/admin/orders/{number}",
            json={"status": bad},
            headers=_auth_header(ADMIN_ID),
        )
    assert resp.status_code == 422


async def test_order_list_filter_status() -> None:
    async with _client() as (client, maker):
        await _create_order_direct(maker, "FILTER01", status="new")
        await _create_order_direct(maker, "FILTER02", status="confirmed")
        all_orders = await client.get("/v1/admin/orders", headers=_auth_header(ADMIN_ID))
        news = await client.get(
            "/v1/admin/orders", params={"status": "new"}, headers=_auth_header(ADMIN_ID)
        )
    assert all_orders.status_code == 200
    assert news.status_code == 200
    assert {o["number"] for o in news.json()} >= {"FILTER01"}
    assert "FILTER02" not in {o["number"] for o in news.json()}


# --- settings + promo ---


async def test_settings_round_trip() -> None:
    async with _client() as (client, _maker):
        before = await client.get("/v1/admin/settings", headers=_auth_header(ADMIN_ID))
        assert before.status_code == 200
        assert before.json()["payment_enabled"] is False
        assert before.json()["usernames"] == []

        put = await client.put(
            "/v1/admin/settings",
            json={
                "dispatch_city": "Київ",
                "card_requisites": "Картка 4111 1111 1111 1111",
                "usernames": ["manager_one", "shop_helper2"],
            },
            headers=_auth_header(ADMIN_ID),
        )
        assert put.status_code == 200
        assert put.json()["dispatch_city"] == "Київ"
        assert put.json()["usernames"] == ["manager_one", "shop_helper2"]

        after = await client.get("/v1/admin/settings", headers=_auth_header(ADMIN_ID))
        assert after.json()["dispatch_city"] == "Київ"
        assert after.json()["card_requisites"] == "Картка 4111 1111 1111 1111"


@pytest.mark.parametrize(
    "bad_usernames",
    [
        ["ab"],
        ["bad-char!"],
        ["x" * 33],
        ["ok_name_but_way_too_long_username_over_32"],
        [f"user_{i:02d}" for i in range(21)],
    ],
)
async def test_settings_bad_username_422(bad_usernames: list[str]) -> None:
    async with _client() as (client, _maker):
        resp = await client.put(
            "/v1/admin/settings",
            json={"usernames": bad_usernames},
            headers=_auth_header(ADMIN_ID),
        )
    assert resp.status_code == 422


async def test_public_settings_unchanged_by_admin_key_write() -> None:
    async with _client() as (client, _maker):
        put = await client.put(
            "/v1/admin/settings",
            json={"payment_provider_key": "sk-super-secret"},
            headers=_auth_header(ADMIN_ID),
        )
        assert put.status_code == 200
        assert put.json()["payment_provider_key"] == "sk-super-secret"

        public = await client.get("/v1/settings/public")
        assert public.status_code == 200
        payload = public.json()
        assert set(payload.keys()) == {"dispatch_city", "card_requisites", "payment_enabled"}
        assert payload["payment_enabled"] is False
        assert "sk-super-secret" not in public.text


async def test_promo_flag_toggle() -> None:
    async with _client() as (client, maker):
        ids = await _seed_ids(client, maker)
        resp = await client.put(
            "/v1/admin/promos",
            json={"id": ids["promo_id"], "is_active": True},
            headers=_auth_header(ADMIN_ID),
        )
    assert resp.status_code == 200
    assert resp.json() == {"id": ids["promo_id"], "is_active": True}


# --- FIX-0 proof: exact Checkout body validates against OrderCreate ---


def test_checkout_body_contract_passes_order_create() -> None:
    """The exact shape Checkout.tsx sends (no total, no idempotency_key)."""
    body = {
        "name": "Олена",
        "phone": "+380501234567",
        "city": "Львів",
        "branch": "Відділення №1",
        "comment": "",
        "items": [{"variant_id": 1, "qty": 2}],
    }
    assert OrderCreate.model_validate(body).name == "Олена"


@pytest.mark.parametrize("extra", [{"total": 999}, {"idempotency_key": str(uuid.uuid4())}])
def test_checkout_body_extras_rejected(extra: dict) -> None:
    body = {
        "name": "Олена",
        "phone": "+380501234567",
        "city": "Львів",
        "branch": "Відділення №1",
        "comment": "",
        "items": [{"variant_id": 1, "qty": 2}],
        **extra,
    }
    with pytest.raises(Exception):
        OrderCreate.model_validate(body)


# --- Wave-3 hardening (B4): blank TTN is a no-op, status-only keeps stored TTN ---


async def test_status_only_and_blank_ttn_preserve_stored_ttn() -> None:
    async with _client() as (client, maker):
        number = await _create_order_direct(maker, "TTNKEEP01")
        set_ttn = await client.patch(
            f"/v1/admin/orders/{number}",
            json={"ttn": "20400012345678"},
            headers=_auth_header(ADMIN_ID),
        )
        assert set_ttn.status_code == 200
        assert set_ttn.json()["ttn"] == "20400012345678"
        blank = await client.patch(
            f"/v1/admin/orders/{number}",
            json={"status": "confirmed", "ttn": ""},
            headers=_auth_header(ADMIN_ID),
        )
        assert blank.status_code == 200, blank.text
        assert blank.json()["ttn"] == "20400012345678"
        status_only = await client.patch(
            f"/v1/admin/orders/{number}",
            json={"status": "shipped"},
            headers=_auth_header(ADMIN_ID),
        )
    assert status_only.status_code == 200
    assert status_only.json()["ttn"] == "20400012345678"

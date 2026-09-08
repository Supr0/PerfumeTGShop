"""RED: checkout + buyer orders + public settings contract (R-10..R-14, R-16).

Contract under test (routers prefix /v1):
  POST /v1/orders (Idempotency-Key: UUID header required, else 422)
    body {name 1..80, phone, city 1..120, branch 1..120 free text,
          comment <=500 optional, items:[{variant_id, qty 1..99}] min 1}
    - phone: strip spaces/dashes/parens, then ^\\+380\\d{9}$ else 422
    - NO total field in body: sending `total` -> 422 (extra=forbid)
    - server recomputes total from ProductVariant prices; unknown variant -> 422/404
    - atomic decrement (UPDATE..WHERE stock>=qty); conflict ->
      409 {"detail": "out_of_stock", "volumes": [{variant_id, ml, stock}]}
    - success -> 201 {"number"}; same Idempotency-Key replay -> 200 same number
    - commit BEFORE notify; notify failure never rolls back
  GET /v1/orders/mine -> own orders only, each
    {number, status, ttn, total, items, created}
  GET /v1/orders/{number} -> owner-or-admin else 403; missing -> 404
  GET /v1/settings/public -> {dispatch_city, card_requisites, payment_enabled}
    payment_enabled is False; no secret values/keys serialized.

Auth: identity ONLY from X-Telegram-Init-Data header (validated initData);
no client-supplied user id is ever trusted.
"""

from __future__ import annotations

import asyncio
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from unittest.mock import AsyncMock, patch

from apps.api.core.config import settings
from apps.api.db.session import Base, get_session
from apps.api.models.misc import Setting
from apps.api.models.order import Order
from apps.api.models.product import Product, ProductVariant
from apps.api.routers.orders import router as orders_router
from apps.api.routers.settings import router as settings_router

pytestmark = pytest.mark.anyio

BOT_TOKEN = "123456:TEST-TOKEN_abcdef"
USER_A = 111111111
USER_B = 222222222
ADMIN_ID = 999999999


def _sign(fields: dict[str, str], bot_token: str = BOT_TOKEN) -> str:
    data_check_string = "\n".join(f"{k}=<{v}>" for k, v in sorted(fields.items()))
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


def _body(**overrides: object) -> dict:
    body: dict = {
        "name": "Олена",
        "phone": "+380671234567",
        "city": "Львів",
        "branch": "Відділення №7",
        "comment": "зателефонувати",
        "items": [],
    }
    body.update(overrides)
    return body


async def _seed(session: AsyncSession) -> dict[str, int]:
    product = Product(name="Тестовий аромат", brand="Test", is_active=True)
    product.variants = [
        ProductVariant(volume_ml=5, price_minor_uah=150000, stock=5),
        ProductVariant(volume_ml=10, price_minor_uah=250000, stock=1),
    ]
    session.add(product)
    await session.flush()
    return {"v5": product.variants[0].id, "v10": product.variants[1].id}


@asynccontextmanager
async def _client(
    db_path: object = None,
) -> AsyncIterator[tuple[AsyncClient, dict[str, int], async_sessionmaker]]:
    if db_path is None:
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        # File-backed DB with a real pool: separate connections/transactions,
        # required for faithful concurrent-request tests (memory + StaticPool
        # shares ONE transaction across sessions, which production never does).
        engine = create_async_engine(
            f"sqlite+aiosqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        ids = await _seed(session)
        await session.commit()

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    settings.bot_token = BOT_TOKEN
    settings.admin_ids = [ADMIN_ID]

    app = FastAPI()
    app.include_router(orders_router)
    app.include_router(settings_router)
    app.dependency_overrides[get_session] = _override
    with patch(
        "apps.api.services.notify.notify_new_order",
        new=AsyncMock(return_value=True),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, ids, maker
    await engine.dispose()


async def _create(
    client: AsyncClient,
    ids: dict[str, int],
    tg_id: int = USER_A,
    key: str | None = None,
    **overrides: object,
) -> tuple[object, str]:
    items = overrides.pop("items", [{"variant_id": ids["v5"], "qty": 2}])
    resp = await client.post(
        "/v1/orders",
        json=_body(items=items, **overrides),
        headers={**_auth_header(tg_id), "Idempotency-Key": key or str(uuid.uuid4())},
    )
    return resp, key or ""


async def test_happy_path_201_and_shape() -> None:
    async with _client() as (client, ids, _):
        resp, _ = await _create(client, ids)
    assert resp.status_code == 201
    number = resp.json()["number"]
    assert isinstance(number, str) and len(number) == 8


async def test_mine_returns_created_order_with_total() -> None:
    async with _client() as (client, ids, _):
        resp, _ = await _create(client, ids)
        assert resp.status_code == 201
        number = resp.json()["number"]
        mine = await client.get("/v1/orders/mine", headers=_auth_header(USER_A))
    assert mine.status_code == 200
    orders = mine.json()
    assert len(orders) == 1
    order = orders[0]
    assert order["number"] == number
    assert order["status"] == "new"
    assert order["ttn"] is None
    assert order["total"] == 150000 * 2
    assert order["items"] == [
        {"variant_id": ids["v5"], "qty": 2, "price_minor_uah": 150000}
    ]
    assert isinstance(order["created"], str) and order["created"]


async def test_replay_same_key_200_no_duplicate() -> None:
    async with _client() as (client, ids, _):
        key = str(uuid.uuid4())
        first, _ = await _create(client, ids, key=key)
        second, _ = await _create(client, ids, key=key)
        mine = await client.get("/v1/orders/mine", headers=_auth_header(USER_A))
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["number"] == first.json()["number"]
    assert len(mine.json()) == 1


async def test_bad_phone_422() -> None:
    async with _client() as (client, ids, _):
        resp, _ = await _create(client, ids, phone="12345")
    assert resp.status_code == 422


async def test_phone_with_spaces_dashes_parens_accepted() -> None:
    async with _client() as (client, ids, _):
        resp, _ = await _create(client, ids, phone="+380 (67) 123-45-67")
    assert resp.status_code == 201


async def test_empty_items_422() -> None:
    async with _client() as (client, ids, _):
        resp, _ = await _create(client, ids, items=[])
    assert resp.status_code == 422


async def test_total_field_rejected_422() -> None:
    async with _client() as (client, ids, _):
        payload = _body(items=[{"variant_id": ids["v5"], "qty": 1}], total=999)
        resp = await client.post(
            "/v1/orders",
            json=payload,
            headers={**_auth_header(USER_A), "Idempotency-Key": str(uuid.uuid4())},
        )
    assert resp.status_code == 422


async def test_missing_idempotency_key_422() -> None:
    async with _client() as (client, ids, _):
        resp = await client.post(
            "/v1/orders",
            json=_body(items=[{"variant_id": ids["v5"], "qty": 1}]),
            headers=_auth_header(USER_A),
        )
    assert resp.status_code == 422


async def test_invalid_idempotency_key_422() -> None:
    async with _client() as (client, ids, _):
        resp = await client.post(
            "/v1/orders",
            json=_body(items=[{"variant_id": ids["v5"], "qty": 1}]),
            headers={**_auth_header(USER_A), "Idempotency-Key": "not-a-uuid"},
        )
    assert resp.status_code == 422


async def test_unknown_variant_422_or_404() -> None:
    async with _client() as (client, ids, _):
        resp, _ = await _create(client, ids, items=[{"variant_id": 999999, "qty": 1}])
    assert resp.status_code in (422, 404)


async def test_oos_race_409_with_volumes() -> None:
    async with _client() as (client, ids, maker):
        first, _ = await _create(
            client, ids, items=[{"variant_id": ids["v10"], "qty": 1}]
        )
        assert first.status_code == 201
        second, _ = await _create(
            client, ids, items=[{"variant_id": ids["v10"], "qty": 1}]
        )
    assert second.status_code == 409
    payload = second.json()
    assert payload["detail"] == "out_of_stock"
    assert payload["volumes"] == [
        {"variant_id": ids["v10"], "ml": 10, "stock": 0}
    ]
    _ = maker


async def test_mine_scoping_two_users_isolated() -> None:
    async with _client() as (client, ids, _):
        resp_a, _ = await _create(client, ids, tg_id=USER_A)
        resp_b, _ = await _create(client, ids, tg_id=USER_B)
        assert resp_a.status_code == 201
        assert resp_b.status_code == 201
        mine_a = (await client.get("/v1/orders/mine", headers=_auth_header(USER_A))).json()
        mine_b = (await client.get("/v1/orders/mine", headers=_auth_header(USER_B))).json()
    assert [o["number"] for o in mine_a] == [resp_a.json()["number"]]
    assert [o["number"] for o in mine_b] == [resp_b.json()["number"]]


async def test_cross_owner_403_admin_200_missing_404() -> None:
    async with _client() as (client, ids, _):
        resp, _ = await _create(client, ids, tg_id=USER_A)
        number = resp.json()["number"]
        forbidden = await client.get(
            f"/v1/orders/{number}", headers=_auth_header(USER_B)
        )
        admin = await client.get(
            f"/v1/orders/{number}", headers=_auth_header(ADMIN_ID)
        )
        owner = await client.get(
            f"/v1/orders/{number}", headers=_auth_header(USER_A)
        )
        missing = await client.get(
            "/v1/orders/NOPE1234", headers=_auth_header(USER_A)
        )
    assert forbidden.status_code == 403
    assert admin.status_code == 200
    assert admin.json()["number"] == number
    assert owner.status_code == 200
    assert missing.status_code == 404


async def test_unauthenticated_401() -> None:
    async with _client() as (client, ids, _):
        resp = await client.get("/v1/orders/mine")
    assert resp.status_code == 401
    _ = ids


async def test_public_settings_shape_no_secrets() -> None:
    async with _client() as (client, ids, maker):
        async with maker() as session:
            session.add_all(
                [
                    Setting(key="dispatch_city", value="Київ"),
                    Setting(key="card_requisites", value="Картка 4111 ..."),
                    Setting(key="payment_provider_key", value="sk-super-secret"),
                ]
            )
            await session.commit()
        resp = await client.get("/v1/settings/public")
    assert resp.status_code == 200
    payload = resp.json()
    assert set(payload.keys()) == {"dispatch_city", "card_requisites", "payment_enabled"}
    assert payload["dispatch_city"] == "Київ"
    assert payload["card_requisites"] == "Картка 4111 ..."
    assert payload["payment_enabled"] is False
    assert "sk-super-secret" not in resp.text
    _ = ids


async def test_public_settings_defaults() -> None:
    async with _client() as (client, ids, _):
        resp = await client.get("/v1/settings/public")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["dispatch_city"] == "Львів"
    assert isinstance(payload["card_requisites"], str) and payload["card_requisites"]
    assert payload["payment_enabled"] is False
    lowered = resp.text.lower()
    assert "token" not in lowered
    assert "secret" not in lowered
    _ = ids


async def test_notify_failure_never_rolls_back() -> None:
    async with _client() as (client, ids, _):
        with patch(
            "apps.api.services.notify.notify_new_order",
            new=AsyncMock(side_effect=RuntimeError("tg down")),
        ):
            resp, _ = await _create(client, ids)
        mine = await client.get("/v1/orders/mine", headers=_auth_header(USER_A))
    assert resp.status_code == 201
    assert len(mine.json()) == 1


async def test_payments_stub_disabled_and_instruction_builder() -> None:
    from apps.api.services.payments_stub import (
        ProviderStub,
        build_card_instructions,
    )

    provider = ProviderStub(name="mono")
    assert provider.enabled is False
    result = await provider.create_payment(total_minor_uah=10000, order_number="ABC")
    assert result["ok"] is False
    text = build_card_instructions("Картка 4111 ...", 150000)
    assert "4111" in text
    assert "1500" in text
    assert "sk-" not in text


async def test_np_directory_normalize_and_passthrough() -> None:
    from apps.api.services.np_directory import (
        TOP_CITIES,
        lookup_branches,
        normalize_branch,
        normalize_city,
    )

    assert "Львів" in TOP_CITIES
    assert normalize_city("  Львів ") == "Львів"
    assert normalize_branch("Будь-яке відділення №123") == "Будь-яке відділення №123"
    assert isinstance(lookup_branches("Невідоме місто"), list)
    with pytest.raises(ValueError):
        normalize_city("x" * 121)


# --- Wave-3 hardening (B1/B2/B3/A5): must fail before the fix ---

DB_ONLY_ADMIN = 555555555


async def test_concurrent_same_key_single_row_same_number(tmp_path) -> None:
    """B1: concurrent double-POST with one key -> one row, same number, no 500."""
    async with _client(tmp_path / "race.db") as (client, ids, maker):
        key = str(uuid.uuid4())

        async def _post() -> object:
            return await client.post(
                "/v1/orders",
                json=_body(items=[{"variant_id": ids["v5"], "qty": 1}]),
                headers={**_auth_header(USER_A), "Idempotency-Key": key},
            )

        first, second = await asyncio.gather(_post(), _post())
        async with maker() as session:
            rows = (
                await session.execute(
                    select(Order).where(
                        Order.owner_tg_id == USER_A, Order.idempotency_key == key
                    )
                )
            ).scalars().all()
    assert first.status_code in (200, 201), first.text
    assert second.status_code in (200, 201), second.text
    assert first.status_code != 500 and second.status_code != 500
    assert second.json()["number"] == first.json()["number"]
    assert len(rows) == 1


async def test_db_only_admin_can_view_foreign_order() -> None:
    """B2: admin allowlisted via DB Setting (not env) reads another's order -> 200."""
    async with _client() as (client, ids, maker):
        async with maker() as session:
            session.add(Setting(key="admin_ids", value=json.dumps([DB_ONLY_ADMIN])))
            await session.commit()
        resp, _ = await _create(client, ids, tg_id=USER_A)
        assert resp.status_code == 201
        number = resp.json()["number"]
        got = await client.get(
            f"/v1/orders/{number}", headers=_auth_header(DB_ONLY_ADMIN)
        )
    assert got.status_code == 200
    assert got.json()["number"] == number


async def test_negative_stock_rejected_by_check_constraint() -> None:
    """B3: direct negative-stock variant insert -> IntegrityError."""
    async with _client() as (client, ids, maker):
        async with maker() as session:
            product = (await session.execute(select(Product))).scalars().first()
            assert product is not None
            session.add(
                ProductVariant(
                    product_id=product.id,
                    volume_ml=5,
                    price_minor_uah=150000,
                    stock=-1,
                )
            )
            with pytest.raises(IntegrityError):
                await session.commit()
            await session.rollback()
    _ = (client, ids)


async def test_idempotency_key_scoped_per_owner() -> None:
    """A5: same key by ANOTHER tg_id -> 409 (no number leak); own replay -> 200."""
    async with _client() as (client, ids, _):
        key = str(uuid.uuid4())
        first, _ = await _create(client, ids, tg_id=USER_A, key=key)
        assert first.status_code == 201
        first_number = first.json()["number"]
        other = await client.post(
            "/v1/orders",
            json=_body(items=[{"variant_id": ids["v5"], "qty": 1}]),
            headers={**_auth_header(USER_B), "Idempotency-Key": key},
        )
        assert other.status_code == 409
        assert other.json().get("number") != first_number
        replay, _ = await _create(client, ids, tg_id=USER_A, key=key)
    assert replay.status_code == 200
    assert replay.json()["number"] == first_number

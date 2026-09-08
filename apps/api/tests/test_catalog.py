"""RED: catalog listing + detail contract (traces R-01, R-03, R-06).

Contract under test (apps/api/routers/catalog.py, prefix /v1):
  GET /v1/catalog?brand=&family=&gender=&season=&min_price=&max_price=
      &in_stock=&sort=&q=&limit=&offset= -> {items[], total}
    - brand/family/gender/season repeatable (?gender=M&gender=F is union);
    - min_price/max_price are minor UAH; min>max -> 422
    - in_stock=true keeps products with ANY variant stock>0
    - sort in {popular(default),price_asc,price_desc,new};
      popular = default seed (insertion) order
    - q = case-insensitive substring over name+brand+notes(description)
    - limit<=100/offset; total = filtered count before pagination
    - empty result -> 200 {items:[],total:0}, never 404
  GET /v1/products/{id} -> full ProductOut detail; 404 if missing.

Edge behavior defined here (server never trusts client):
  - family/gender/season/notes/longevity/sillage/place_tags/image columns
    exist on Product (see apps/api/models/product.py) and the router
    filters on them directly; brand/family/gender/season accept repeated params,
  - q wildcards (%, _, \\) are escaped so user input matches literally.
  - in_stock=false/omitted -> no stock filter.
  - limit default 20, max 100; invalid sort -> 422 (FastAPI validation).

NOTE: SQLite lower() folds ASCII case only, so Cyrillic case-folding is
asserted with exact case here; case-insensitivity itself is proven via
Latin brand. Production Postgres ILIKE folds both.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from apps.api.db.session import Base, get_session
from apps.api.models.product import Product, ProductVariant
from apps.api.routers.catalog import router as catalog_router

pytestmark = pytest.mark.anyio


def _product(name: str, brand: str, description: str, **extra: object) -> Product:
    product = Product(name=name, brand=brand, description=description, is_active=True)
    for key, value in extra.items():
        setattr(product, key, value)
    return product


async def _seed(session: AsyncSession) -> dict[str, int]:
    """Four products with distinct brands/prices/stock/notes. Returns ids."""
    p1 = _product(
        "Весняний сад",
        "Chanel",
        "жасмин і троянда, весняний настрій",
        family="floral",
        gender="F",
        season=["spring"],
        notes_top="жасмин, неролі",
        notes_heart="троянда",
        notes_base="мускус",
        longevity=4,
        sillage=3,
        place_tags=["daily", "office"],
        image="images/placeholder/demo-0001.jpg",
    )
    p1.variants = [
        ProductVariant(volume_ml=3, price_minor_uah=150000, stock=5),
        ProductVariant(volume_ml=5, price_minor_uah=200000, stock=0),
    ]
    p2 = _product(
        "Нічний уд",
        "Dior",
        "уд та амбра для вечора",
        family="floral",
        gender="M",
        season=["winter"],
        notes_top="уд, рожевий перець",
        notes_heart="амбра",
        notes_base="сандал",
        longevity=5,
        sillage=5,
        place_tags=["evening"],
        image="images/placeholder/demo-0002.jpg",
    )
    p2.variants = [
        ProductVariant(volume_ml=3, price_minor_uah=100000, stock=0),
        ProductVariant(volume_ml=5, price_minor_uah=120000, stock=0),
    ]
    p3 = _product(
        "Цитрусовий ранок",
        "Chanel",
        "цитрус і бергамот, денний",
        family="floral",
        gender="uni",
        season=["summer"],
        notes_top="бергамот, лимон",
        notes_heart="неролі",
        notes_base="білий мускус",
        longevity=3,
        sillage=2,
        place_tags=["daily", "sport"],
        image="images/placeholder/demo-0003.jpg",
    )
    p3.variants = [ProductVariant(volume_ml=10, price_minor_uah=300000, stock=2)]
    p4 = _product(
        "Морський бриз",
        "Zara",
        "морські ноти, свіжість",
        family="marine",
        gender="uni",
        season=["spring", "summer"],
        notes_top="calone, marine accord",
        notes_heart="sea salt",
        notes_base="driftwood",
        longevity=2,
        sillage=2,
        place_tags=["sport", "travel"],
        image="images/placeholder/demo-0004.jpg",
    )
    p4.variants = [ProductVariant(volume_ml=5, price_minor_uah=50000, stock=10)]
    session.add_all([p1, p2, p3, p4])
    await session.flush()
    return {"p1": p1.id, "p2": p2.id, "p3": p3.id, "p4": p4.id}


@asynccontextmanager
async def _client() -> AsyncIterator[tuple[AsyncClient, dict[str, int]]]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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

    app = FastAPI()
    app.include_router(catalog_router)
    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, ids
    await engine.dispose()


def _ids_in_order(payload: dict) -> list[int]:
    return [item["id"] for item in payload["items"]]


async def test_multi_brand_plus_family_combo() -> None:
    async with _client() as (client, ids):
        resp = await client.get(
            "/v1/catalog", params=[("brand", "Chanel"), ("brand", "Dior"), ("family", "floral")]
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert set(_ids_in_order(body)) == {ids["p1"], ids["p2"], ids["p3"]}


async def test_price_range_matches_any_variant() -> None:
    async with _client() as (client, ids):
        resp = await client.get("/v1/catalog", params={"min_price": 90000, "max_price": 160000})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert set(_ids_in_order(body)) == {ids["p1"], ids["p2"]}


async def test_min_greater_than_max_returns_422() -> None:
    async with _client() as (client, _):
        resp = await client.get("/v1/catalog", params={"min_price": 200000, "max_price": 100000})
    assert resp.status_code == 422


async def test_in_stock_true_excludes_all_oos() -> None:
    async with _client() as (client, ids):
        resp = await client.get("/v1/catalog", params={"in_stock": "true"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert ids["p2"] not in _ids_in_order(body)


async def test_sort_price_asc_and_desc() -> None:
    async with _client() as (client, ids):
        asc = (await client.get("/v1/catalog", params={"sort": "price_asc"})).json()
        desc = (await client.get("/v1/catalog", params={"sort": "price_desc"})).json()
    assert _ids_in_order(asc) == [ids["p4"], ids["p2"], ids["p1"], ids["p3"]]
    assert _ids_in_order(desc) == [ids["p3"], ids["p1"], ids["p2"], ids["p4"]]


async def test_sort_new_and_popular_default() -> None:
    async with _client() as (client, ids):
        new = (await client.get("/v1/catalog", params={"sort": "new"})).json()
        default = (await client.get("/v1/catalog")).json()
        popular = (await client.get("/v1/catalog", params={"sort": "popular"})).json()
    assert _ids_in_order(new) == [ids["p4"], ids["p3"], ids["p2"], ids["p1"]]
    assert _ids_in_order(default) == [ids["p1"], ids["p2"], ids["p3"], ids["p4"]]
    assert _ids_in_order(popular) == _ids_in_order(default)


async def test_q_matches_notes_and_brand_case_insensitive() -> None:
    async with _client() as (client, ids):
        notes = (await client.get("/v1/catalog", params={"q": "жасмин"})).json()
        brand = (await client.get("/v1/catalog", params={"q": "DIOR"})).json()
    assert _ids_in_order(notes) == [ids["p1"]]
    assert _ids_in_order(brand) == [ids["p2"]]


async def test_pagination_keeps_total() -> None:
    async with _client() as (client, ids):
        body = (await client.get("/v1/catalog", params={"limit": 2, "offset": 1})).json()
    assert body["total"] == 4
    assert _ids_in_order(body) == [ids["p2"], ids["p3"]]


async def test_empty_result_is_200_empty_not_404() -> None:
    async with _client() as (client, _):
        resp = await client.get("/v1/catalog", params={"brand": "NoSuchBrand"})
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0}


async def test_detail_returns_full_variants() -> None:
    async with _client() as (client, ids):
        resp = await client.get(f"/v1/products/{ids['p1']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Весняний сад"
    assert body["brand"] == "Chanel"
    assert len(body["variants"]) == 2
    assert {v["volume_ml"] for v in body["variants"]} == {3, 5}


async def test_detail_missing_returns_404() -> None:
    async with _client() as (client, _):
        resp = await client.get("/v1/products/999999")
    assert resp.status_code == 404


async def test_family_plus_season_combo_filters() -> None:
    async with _client() as (client, ids):
        body = (
            await client.get("/v1/catalog", params={"family": "floral", "season": "spring"})
        ).json()
    assert body["total"] == 1
    assert _ids_in_order(body) == [ids["p1"]]


async def test_q_matches_notes_top_case_insensitive() -> None:
    async with _client() as (client, ids):
        body = (await client.get("/v1/catalog", params={"q": "CALONE"})).json()
    assert _ids_in_order(body) == [ids["p4"]]


async def test_q_percent_is_literal_not_wildcard() -> None:
    """q="100%" must not leak the % wildcard (would match every row)."""
    async with _client() as (client, _):
        body = (await client.get("/v1/catalog", params={"q": "100%"})).json()
    assert body == {"items": [], "total": 0}


async def test_q_underscore_is_literal_not_wildcard() -> None:
    """q="_" must not leak the _ wildcard (would match every row)."""
    async with _client() as (client, _):
        body = (await client.get("/v1/catalog", params={"q": "_"})).json()
    assert body == {"items": [], "total": 0}


async def test_gender_single_value_still_filters() -> None:
    async with _client() as (client, ids):
        body = (await client.get("/v1/catalog", params={"gender": "F"})).json()
    assert body["total"] == 1
    assert _ids_in_order(body) == [ids["p1"]]


async def test_gender_multi_value_returns_union() -> None:
    async with _client() as (client, ids):
        resp = await client.get(
            "/v1/catalog", params=[("gender", "M"), ("gender", "F")]
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert set(_ids_in_order(body)) == {ids["p1"], ids["p2"]}


async def test_season_multi_value_returns_union() -> None:
    async with _client() as (client, ids):
        resp = await client.get(
            "/v1/catalog", params=[("season", "spring"), ("season", "summer")]
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert set(_ids_in_order(body)) == {ids["p1"], ids["p3"], ids["p4"]}


async def test_detail_includes_notes_and_characteristics() -> None:
    async with _client() as (client, ids):
        resp = await client.get(f"/v1/products/{ids['p1']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["family"] == "floral"
    assert body["gender"] == "F"
    assert body["season"] == ["spring"]
    assert body["notes_top"] == "жасмин, неролі"
    assert body["notes_heart"] == "троянда"
    assert body["notes_base"] == "мускус"
    assert body["longevity"] == 4
    assert body["sillage"] == 3
    assert body["place_tags"] == ["daily", "office"]
    assert body["image"] == "images/placeholder/demo-0001.jpg"
    assert body["is_hit"] is False
    assert body["is_new"] is False

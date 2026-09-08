"""Seed-to-catalog smoke gate (R-18: R-02 seed x R-01/R-03/R-06 catalog).

Covers gate (b) ONLY: generate.py products loaded via load_products into a
test DB are served by GET /v1/catalog (200 + total + family filter) and
GET /v1/products/{id} (200). All other gates already exist and are NOT
duplicated here:
  (a) payment_enabled default false -> test_orders (shape/defaults),
      test_admin (round_trip/unchanged_by_key_write); no admin toggle
      exists by design (hardcoded False stub).
  (c) non-admin 403 every admin route -> test_admin (get/write 403).
  (d) stale auth_date reject -> test_security_tma.
  (e) server-reprice (422 on total + stored total == DB sum) -> test_orders
      (total_field_rejected_422, mine_returns_created_order_with_total).
  (f) ownership 403 -> test_orders (cross_owner_403, mine_scoping).
"""

from __future__ import annotations

import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages" / "seed"))
from generate import generate_products  # noqa: E402
from load import load_products  # noqa: E402

from apps.api.db.session import get_session  # noqa: E402
from apps.api.routers.catalog import router as catalog_router  # noqa: E402

pytestmark = pytest.mark.anyio

SEED_COUNT = 10
SEED_VALUE = 42


@asynccontextmanager
async def _catalog_client(
    database_url: str,
) -> AsyncIterator[AsyncClient]:
    """Serve the catalog router from an existing (seed-loaded) DB file."""
    engine = create_async_engine(
        database_url, connect_args={"check_same_thread": False}
    )
    try:
        maker = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        async def _override() -> AsyncIterator[AsyncSession]:
            async with maker() as session:
                yield session

        app = FastAPI()
        app.include_router(catalog_router)
        app.dependency_overrides[get_session] = _override
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            yield client
    finally:
        await engine.dispose()


async def test_seed_to_catalog_smoke(tmp_path) -> None:
    """load_products(~10) -> catalog total + family filter + detail 200."""
    products = generate_products(count=SEED_COUNT, seed=SEED_VALUE)
    database_url = f"sqlite+aiosqlite:///{tmp_path}/seed_smoke.db"
    summary = await load_products(products, database_url)
    assert summary == {"products": SEED_COUNT, "variants": SEED_COUNT * 3}

    async with _catalog_client(database_url) as client:
        catalog = await client.get("/v1/catalog")
        assert catalog.status_code == 200
        assert catalog.json()["total"] == SEED_COUNT

        family = products[0]["family"]
        expected = sum(1 for p in products if p["family"] == family)
        filtered = await client.get("/v1/catalog", params={"family": family})
        assert filtered.status_code == 200
        assert filtered.json()["total"] == expected
        assert {i["family"] for i in filtered.json()["items"]} == {family}

        first_id = catalog.json()["items"][0]["id"]
        detail = await client.get(f"/v1/products/{first_id}")
        assert detail.status_code == 200
        assert len(detail.json()["variants"]) == 3

"""Full-app mount test (H1): proves apps.api.main wires every router.

Asserts against the REAL `app` object (not a test-local FastAPI instance):
  GET /v1/catalog -> 200 (catalog router mounted)
  GET /v1/products/999999 -> 404 (detail route mounted, missing id)

This proves wiring only, not router logic (covered in test_catalog).
get_session is overridden with an empty in-memory SQLite DB; the
override is removed after the test so other suites are unaffected.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from apps.api.db.session import Base, get_session
from apps.api.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async def _init() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_init())
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app.dependency_overrides[get_session] = _override
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_session, None)
        asyncio.run(engine.dispose())


def test_full_app_serves_catalog(client: TestClient) -> None:
    resp = client.get("/v1/catalog")
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0}


def test_full_app_product_detail_404(client: TestClient) -> None:
    resp = client.get("/v1/products/999999")
    assert resp.status_code == 404

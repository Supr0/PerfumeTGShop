"""Loader tests: upsert products+variants by (brand, name) into an async DB."""
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate import generate_products
from load import _product_fields, load_products


def test_load_five_products_with_variants(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    products = generate_products(count=5, seed=42)
    summary = asyncio.run(load_products(products, url))
    assert summary == {"products": 5, "variants": 15}


def test_rerun_is_idempotent(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    products = generate_products(count=5, seed=42)
    asyncio.run(load_products(products, url))
    summary = asyncio.run(load_products(products, url))
    assert summary == {"products": 5, "variants": 15}


def test_variant_prices_match_generate_output(tmp_path):
    from apps.api.models.product import Product, ProductVariant

    url = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    products = generate_products(count=5, seed=42)
    asyncio.run(load_products(products, url))

    expected = {
        (p["brand"], p["name"], v["ml"]): (v["price_minor_UAH"], v["stock"])
        for p in products
        for v in p["volumes"]
    }

    async def _fetch():
        engine = create_async_engine(url)
        try:
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with maker() as session:
                rows = (
                    await session.execute(
                        select(
                            Product.brand,
                            Product.name,
                            ProductVariant.volume_ml,
                            ProductVariant.price_minor_uah,
                            ProductVariant.stock,
                        ).join(ProductVariant, ProductVariant.product_id == Product.id)
                    )
                ).all()
                return rows
        finally:
            await engine.dispose()

    rows = asyncio.run(_fetch())
    assert len(rows) == 15
    for brand, name, ml, price, stock in rows:
        assert expected[(brand, name, ml)] == (price, stock)


def test_product_fields_map_notes_and_description():
    products = generate_products(count=1, seed=42)
    fields = _product_fields(products[0])
    notes = products[0]["notes"]
    assert fields["notes_top"] == ", ".join(notes["top"])
    assert fields["notes_heart"] == ", ".join(notes["heart"])
    assert fields["notes_base"] == ", ".join(notes["base"])
    assert fields["description"] == products[0]["description"]["uk"]
    assert fields["family"] == products[0]["family"]
    assert fields["season"] == products[0]["season"]

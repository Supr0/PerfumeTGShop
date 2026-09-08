"""Seed loader: upsert generate.py demo products into the async DB (R-02).

Reads the generate module directly (no subprocess) and upserts products plus
their 3/5/10 ml variants by the (brand, name) natural key, so reruns are
idempotent. Target DB comes from DATABASE_URL, with a local sqlite fallback
for dev. CLI: --count / --seed.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(
    0,
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)

from generate import generate_products  # noqa: E402

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import selectinload  # noqa: E402

from apps.api.db.session import Base  # noqa: E402
from apps.api.models.product import Product, ProductVariant  # noqa: E402

DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./seed.db"


def _join_notes(value: object) -> str | None:
    """generate.py notes are lists; the Product columns store joined text."""
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value) if value else None


def _product_fields(item: dict) -> dict:
    """Map one generate.py product dict onto Product columns."""
    notes = item.get("notes") or {}
    description = item.get("description") or ""
    if isinstance(description, dict):
        description = description.get("uk") or ""
    return {
        "description": description,
        "family": item.get("family"),
        "gender": item.get("gender"),
        "season": item.get("season"),
        "notes_top": _join_notes(notes.get("top")),
        "notes_heart": _join_notes(notes.get("heart")),
        "notes_base": _join_notes(notes.get("base")),
        "longevity": item.get("longevity"),
        "sillage": item.get("sillage"),
        "place_tags": item.get("place_tags"),
        "image": item.get("image"),
    }


async def load_products(products: list[dict], database_url: str) -> dict[str, int]:
    """Upsert products + variants; returns total {"products", "variants"}."""
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with maker() as session:
            for item in products:
                product = (
                    await session.execute(
                        select(Product)
                        .options(selectinload(Product.variants))
                        .where(
                            Product.brand == item["brand"],
                            Product.name == item["name"],
                        )
                    )
                ).scalar_one_or_none()
                if product is None:
                    product = Product(
                        brand=item["brand"],
                        name=item["name"],
                        is_active=True,
                        **_product_fields(item),
                    )
                    session.add(product)
                    await session.flush()
                    by_volume: dict[int, ProductVariant] = {}
                else:
                    for key, value in _product_fields(item).items():
                        setattr(product, key, value)
                    by_volume = {v.volume_ml: v for v in product.variants}
                for volume in item["volumes"]:
                    variant = by_volume.get(volume["ml"])
                    if variant is None:
                        session.add(
                            ProductVariant(
                                product_id=product.id,
                                volume_ml=volume["ml"],
                                price_minor_uah=volume["price_minor_UAH"],
                                stock=volume["stock"],
                            )
                        )
                    else:
                        variant.price_minor_uah = volume["price_minor_UAH"]
                        variant.stock = volume["stock"]
            await session.commit()
            total_products = (
                await session.execute(select(func.count(Product.id)))
            ).scalar_one()
            total_variants = (
                await session.execute(select(func.count(ProductVariant.id)))
            ).scalar_one()
            return {"products": total_products, "variants": total_variants}
    finally:
        await engine.dispose()


async def run(count: int, seed: int, database_url: str) -> dict[str, int]:
    """Generate ``count`` demo products and load them into the DB."""
    return await load_products(generate_products(count=count, seed=seed), database_url)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Load demo seed products into the DB.")
    parser.add_argument("--count", type=int, default=200)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)
    if args.count < 0:
        parser.error("--count must be >= 0")
    database_url = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    summary = asyncio.run(run(args.count, args.seed, database_url))
    print(f"loaded {summary['products']} products / {summary['variants']} variants")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

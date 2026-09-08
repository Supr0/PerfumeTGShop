"""Storefront catalog: filtered listing plus product detail (R-01, R-03, R-06)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.db.session import get_session
from apps.api.models.product import Product, ProductVariant
from apps.api.schemas.catalog import ProductOut

router = APIRouter(prefix="/v1", tags=["catalog"])

SortParam = Literal["popular", "price_asc", "price_desc", "new"]

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


class CatalogPage(BaseModel):
    """Paginated listing: page items plus pre-pagination total."""

    items: list[ProductOut]
    total: int


def _season_contains(value: str) -> object:
    """Match one value inside the season JSON list.

    Portable across PG JSONB and sqlite TEXT storage: the JSON payload is
    matched as text for the exact quoted element (e.g. `"summer"`), so a
    substring of another value can never match.
    """
    safe = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").replace('"', "")
    return cast(Product.season, Text).like(f'%"{safe}"%', escape="\\")


def _like_escape(value: str) -> str:
    """Escape LIKE wildcards in user input (same order as _season_contains)."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _variant_exists(*conditions: object) -> object:
    """True when the product has at least one variant matching conditions."""
    return (
        select(1)
        .where(ProductVariant.product_id == Product.id, *conditions)
        .correlate(Product)
        .exists()
    )


@router.get("/catalog", response_model=CatalogPage)
async def list_catalog(
    brand: list[str] | None = Query(default=None),
    family: list[str] | None = Query(default=None),
    gender: str | None = Query(default=None),
    season: str | None = Query(default=None),
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    in_stock: bool | None = Query(default=None),
    sort: SortParam = Query(default="popular"),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> CatalogPage:
    """Filter/sort/paginate active products; empty match is 200 with []."""
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail="min_price must not exceed max_price")

    wheres: list[object] = [Product.is_active == True]  # noqa: E712
    if brand:
        wheres.append(Product.brand.in_(brand))
    if family:
        wheres.append(Product.family.in_(family))
    if gender:
        wheres.append(Product.gender == gender)
    if season:
        wheres.append(_season_contains(season))
    if min_price is not None:
        wheres.append(_variant_exists(ProductVariant.price_minor_uah >= min_price))
    if max_price is not None:
        wheres.append(_variant_exists(ProductVariant.price_minor_uah <= max_price))
    if in_stock:
        wheres.append(_variant_exists(ProductVariant.stock > 0))
    if q:
        like = f"%{_like_escape(q)}%"
        wheres.append(
            or_(
                Product.name.ilike(like, escape="\\"),
                Product.brand.ilike(like, escape="\\"),
                Product.description.ilike(like, escape="\\"),
                Product.notes_top.ilike(like, escape="\\"),
                Product.notes_heart.ilike(like, escape="\\"),
                Product.notes_base.ilike(like, escape="\\"),
            )
        )

    total = (
        await session.execute(
            select(func.count(func.distinct(Product.id))).select_from(Product).where(*wheres)
        )
    ).scalar_one()

    min_price_sq = (
        select(func.min(ProductVariant.price_minor_uah))
        .where(ProductVariant.product_id == Product.id)
        .correlate(Product)
        .scalar_subquery()
    )
    order_by: object = Product.id.asc()
    if sort == "new":
        order_by = Product.id.desc()
    elif sort == "price_asc":
        order_by = min_price_sq.asc().nulls_last()
    elif sort == "price_desc":
        order_by = min_price_sq.desc().nulls_last()

    items = (
        (
            await session.execute(
                select(Product)
                .options(selectinload(Product.variants))
                .where(*wheres)
                .order_by(order_by)
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return CatalogPage(items=list(items), total=total)


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: int, session: AsyncSession = Depends(get_session)
) -> Product:
    """Full product detail with variants; 404 when missing or inactive."""
    product = (
        await session.execute(
            select(Product)
            .options(selectinload(Product.variants))
            .where(Product.id == product_id, Product.is_active == True)  # noqa: E712
        )
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

"""Admin surface (R-08,R-09,R-16,R-17): require_admin on every route.

Allowlist: env ADMIN_IDS (seed) UNION DB Setting "admin_ids" (JSON list).
Endpoints: GET /me, products CRUD, orders list/patch (guarded transitions),
GET/PUT settings (incl. provider key + username list), PUT promo flag.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.core.config import settings
from apps.api.core.security_tma import validate_init_data
from apps.api.db.session import get_session
from apps.api.models.misc import Promo, Setting
from apps.api.models.order import Order, OrderStatus
from apps.api.models.product import Product, ProductVariant
from apps.api.schemas.admin import (
    AdminProductCreate,
    AdminProductUpdate,
    AdminSettingsOut,
    AdminSettingsUpdate,
    AdminOrderUpdate,
    PromoToggle,
)
from apps.api.schemas.catalog import ProductOut

router = APIRouter(prefix="/v1/admin", tags=["admin"])
logger = logging.getLogger(__name__)

ADMIN_IDS_KEY = "admin_ids"
DISPATCH_CITY_KEY = "dispatch_city"
CARD_REQUISITES_KEY = "card_requisites"
PROVIDER_KEY_SETTING = "payment_provider_key"
NOTIFY_USERNAMES_KEY = "notify_usernames"

DEFAULT_DISPATCH_CITY = "Львів"
DEFAULT_CARD_REQUISITES = (
    "Оплата на картку: реквізити надасть менеджер після підтвердження замовлення."
)

NEXT_STATUS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.NEW: {OrderStatus.CONFIRMED},
    OrderStatus.CONFIRMED: {OrderStatus.SHIPPED},
    OrderStatus.SHIPPED: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}


async def load_admin_ids(session: AsyncSession) -> set[int]:
    """Env allowlist UNION DB Setting admin_ids (JSON list, tolerant parse)."""
    ids = set(settings.admin_ids)
    row = await session.get(Setting, ADMIN_IDS_KEY)
    if row is None:
        return ids
    try:
        parsed = json.loads(row.value)
    except (ValueError, TypeError):
        parsed = [p.strip() for p in row.value.split(",") if p.strip()]
    if isinstance(parsed, list):
        for item in parsed:
            try:
                ids.add(int(item))
            except (ValueError, TypeError):
                continue
    return ids


async def require_admin(
    request: Request, session: AsyncSession = Depends(get_session)
) -> int:
    """Telegram id from validated initData when allowlisted; 403 otherwise."""
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    if not init_data:
        raise HTTPException(status_code=403, detail="forbidden")
    try:
        fields = validate_init_data(init_data, settings.bot_token)
    except ValueError:
        raise HTTPException(status_code=403, detail="forbidden") from None
    try:
        tg_id = int(json.loads(fields.get("user", "")).get("id"))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=403, detail="forbidden") from None
    if tg_id not in await load_admin_ids(session):
        raise HTTPException(status_code=403, detail="forbidden")
    return tg_id


def _serialize_order(order: Order) -> dict:
    return {
        "number": order.number,
        "status": order.status.value,
        "ttn": order.ttn,
        "total": order.total_minor_uah,
        "owner_tg_id": order.owner_tg_id,
        "items": [
            {
                "variant_id": item.variant_id,
                "qty": item.qty,
                "price_minor_uah": item.price_minor_uah,
            }
            for item in order.items
        ],
        "created": order.created_at,
    }


def _check_transition(current: OrderStatus, new: OrderStatus) -> None:
    if new == current:
        return
    if new == OrderStatus.CANCELLED:
        return
    if new in NEXT_STATUS.get(current, set()):
        return
    raise HTTPException(status_code=422, detail=f"bad_transition {current.value}->{new.value}")


async def _read_settings_map(session: AsyncSession) -> dict[str, str]:
    rows = (await session.execute(select(Setting))).scalars().all()
    return {row.key: row.value for row in rows}


def _settings_out(stored: dict[str, str]) -> AdminSettingsOut:
    try:
        usernames = json.loads(stored.get(NOTIFY_USERNAMES_KEY, "[]"))
    except (ValueError, TypeError):
        usernames = []
    if not isinstance(usernames, list):
        usernames = []
    return AdminSettingsOut(
        dispatch_city=stored.get(DISPATCH_CITY_KEY, DEFAULT_DISPATCH_CITY),
        card_requisites=stored.get(CARD_REQUISITES_KEY, DEFAULT_CARD_REQUISITES),
        payment_provider_key=stored.get(PROVIDER_KEY_SETTING),
        payment_enabled=False,
        usernames=[str(u) for u in usernames if isinstance(u, str)],
    )


@router.get("/me")
async def get_me(tg_id: int = Depends(require_admin)) -> dict:
    """Admin gate probe: 200 when allowlisted, 403 otherwise."""
    return {"is_admin": True, "tg_id": tg_id}


@router.get("/products", response_model=list[ProductOut])
async def list_products(
    _: int = Depends(require_admin), session: AsyncSession = Depends(get_session)
) -> list[Product]:
    """All products incl. inactive, newest first."""
    rows = (
        (
            await session.execute(
                select(Product)
                .options(selectinload(Product.variants))
                .order_by(Product.id.desc())
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


@router.post("/products", response_model=ProductOut, status_code=201)
async def create_product(
    payload: AdminProductCreate,
    _: int = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> Product:
    """Create a product with its variants."""
    product = Product(
        name=payload.name,
        brand=payload.brand,
        description=payload.description,
        image=payload.image,
        is_active=payload.is_active,
        is_hit=payload.is_hit,
    )
    for variant in payload.variants:
        product.variants.append(
            ProductVariant(
                volume_ml=variant.volume_ml,
                price_minor_uah=variant.price_minor_uah,
                old_price_minor_uah=variant.old_price_minor_uah,
                stock=variant.stock,
            )
        )
    session.add(product)
    await session.commit()
    loaded = (
        await session.execute(
            select(Product)
            .options(selectinload(Product.variants))
            .where(Product.id == product.id)
        )
    ).scalar_one()
    return loaded


@router.put("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    payload: AdminProductUpdate,
    _: int = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> Product:
    """Partial product update; provided variants replace the full set."""
    product = (
        await session.execute(
            select(Product)
            .options(selectinload(Product.variants))
            .where(Product.id == product_id)
        )
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="product_not_found")
    if payload.name is not None:
        product.name = payload.name
    if payload.brand is not None:
        product.brand = payload.brand
    if payload.description is not None:
        product.description = payload.description
    if payload.image is not None:
        product.image = payload.image
    if payload.is_active is not None:
        product.is_active = payload.is_active
    if payload.is_hit is not None:
        product.is_hit = payload.is_hit
    if payload.variants is not None:
        product.variants.clear()
        await session.flush()
        for variant in payload.variants:
            product.variants.append(
                ProductVariant(
                    volume_ml=variant.volume_ml,
                    price_minor_uah=variant.price_minor_uah,
                    old_price_minor_uah=variant.old_price_minor_uah,
                    stock=variant.stock,
                )
            )
    await session.commit()
    loaded = (
        await session.execute(
            select(Product)
            .options(selectinload(Product.variants))
            .where(Product.id == product.id)
        )
    ).scalar_one()
    return loaded


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(
    product_id: int,
    _: int = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a product with its variants; 404 when missing."""
    product = (
        await session.execute(
            select(Product)
            .options(selectinload(Product.variants))
            .where(Product.id == product_id)
        )
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="product_not_found")
    await session.delete(product)
    await session.commit()


@router.get("/orders")
async def list_orders(
    status: OrderStatus | None = Query(default=None),
    _: int = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """All orders, newest first, optional status filter."""
    query = (
        select(Order).options(selectinload(Order.items)).order_by(Order.id.desc())
    )
    if status is not None:
        query = query.where(Order.status == status)
    rows = (await session.execute(query)).scalars().all()
    return [_serialize_order(order) for order in rows]


@router.patch("/orders/{number}")
async def patch_order(
    number: str,
    payload: AdminOrderUpdate,
    _: int = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Guarded status transition and/or TTN update; illegal jumps are 422."""
    order = (
        await session.execute(
            select(Order).options(selectinload(Order.items)).where(Order.number == number)
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="order_not_found")
    if payload.status is not None:
        _check_transition(order.status, payload.status)
        order.status = payload.status
    # Blank/whitespace TTN is a no-op: the client sends ttn:null when cleared,
    # and an empty string must never wipe a stored TTN.
    if payload.ttn and payload.ttn.strip():
        order.ttn = payload.ttn
    await session.commit()
    await session.refresh(order)
    return _serialize_order(order)


@router.get("/settings", response_model=AdminSettingsOut)
async def get_admin_settings(
    _: int = Depends(require_admin), session: AsyncSession = Depends(get_session)
) -> AdminSettingsOut:
    """Admin settings incl. provider key (admin-only, never public)."""
    return _settings_out(await _read_settings_map(session))


@router.put("/settings", response_model=AdminSettingsOut)
async def put_admin_settings(
    payload: AdminSettingsUpdate,
    _: int = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminSettingsOut:
    """Upsert admin settings; bad usernames are 422 via schema validation."""
    stored = await _read_settings_map(session)

    async def _upsert(key: str, value: str) -> None:
        row = await session.get(Setting, key)
        if row is None:
            session.add(Setting(key=key, value=value))
        else:
            row.value = value

    if payload.dispatch_city is not None:
        await _upsert(DISPATCH_CITY_KEY, payload.dispatch_city)
    if payload.card_requisites is not None:
        await _upsert(CARD_REQUISITES_KEY, payload.card_requisites)
    if payload.payment_provider_key is not None:
        await _upsert(PROVIDER_KEY_SETTING, payload.payment_provider_key)
    if payload.usernames is not None:
        await _upsert(NOTIFY_USERNAMES_KEY, json.dumps(payload.usernames))
    await session.commit()
    return _settings_out(await _read_settings_map(session))


@router.put("/promos")
async def put_promo(
    payload: PromoToggle,
    _: int = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Flip a promo banner flag; 404 when the promo is missing."""
    promo = await session.get(Promo, payload.id)
    if promo is None:
        raise HTTPException(status_code=404, detail="promo_not_found")
    promo.is_active = payload.is_active
    await session.commit()
    return {"id": promo.id, "is_active": promo.is_active}

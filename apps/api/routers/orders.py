"""Checkout + buyer order views (R-10..R-14, R-16).

Server-authoritative totals, UUID idempotency via header, atomic stock
decrement, commit-before-notify. Identity always comes from validated
initData (X-Telegram-Init-Data); no client user id is trusted.
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.core.config import settings
from apps.api.core.security_tma import validate_init_data
from apps.api.db.session import get_session
from apps.api.models.order import Order, OrderItem, _short_number
from apps.api.models.product import ProductVariant
from apps.api.routers.admin import load_admin_ids
from apps.api.schemas.orders import OrderCreate, OrderOut
from apps.api.services import notify
from apps.api.services.np_directory import normalize_branch, normalize_city

router = APIRouter(prefix="/v1", tags=["orders"])
logger = logging.getLogger(__name__)


async def get_current_tg_id(request: Request) -> int:
    """Telegram user id from validated initData header; 401 when unusable."""
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    if not init_data:
        raise HTTPException(status_code=401, detail="missing_init_data")
    try:
        fields = validate_init_data(init_data, settings.bot_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="invalid_init_data") from None
    try:
        tg_id = int(json.loads(fields.get("user", "")).get("id"))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=401, detail="invalid_user") from None
    return tg_id


def _serialize(order: Order) -> dict:
    """Buyer-facing order shape: {number,status,ttn,total,items,created}."""
    return {
        "number": order.number,
        "status": order.status.value,
        "ttn": order.ttn,
        "total": order.total_minor_uah,
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


@router.post("/orders")
async def create_order(
    payload: OrderCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
) -> JSONResponse:
    """Idempotent checkout: replay returns 200 with the original number."""
    tg_id = await get_current_tg_id(request)
    key = str(idempotency_key)

    existing = (
        await session.execute(
            select(Order).where(
                Order.owner_tg_id == tg_id, Order.idempotency_key == key
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return JSONResponse(status_code=200, content={"number": existing.number})

    claimed = (
        await session.execute(select(Order).where(Order.idempotency_key == key))
    ).scalar_one_or_none()
    if claimed is not None:
        # Same key, other owner: conflict without leaking their number.
        return JSONResponse(
            status_code=409, content={"detail": "idempotency_key_conflict"}
        )

    try:
        city = normalize_city(payload.city)
        branch = normalize_branch(payload.branch)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    variant_ids = [item.variant_id for item in payload.items]
    rows = (
        await session.execute(
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .where(ProductVariant.id.in_(variant_ids))
        )
    ).scalars().all()
    variants = {variant.id: variant for variant in rows}
    if len(variants) != len(set(variant_ids)):
        raise HTTPException(status_code=422, detail="unknown_variant")

    for item in payload.items:
        result = await session.execute(
            update(ProductVariant)
            .where(
                ProductVariant.id == item.variant_id,
                ProductVariant.stock >= item.qty,
            )
            .values(stock=ProductVariant.stock - item.qty)
        )
        if result.rowcount == 0:
            await session.rollback()
            current = (
                await session.execute(
                    select(ProductVariant).where(
                        ProductVariant.id.in_(variant_ids)
                    )
                )
            ).scalars().all()
            volumes = [
                {
                    "variant_id": variant.id,
                    "ml": variant.volume_ml,
                    "stock": variant.stock,
                }
                for variant in current
                if variant.stock < max(
                    i.qty for i in payload.items if i.variant_id == variant.id
                )
            ]
            return JSONResponse(
                status_code=409,
                content={"detail": "out_of_stock", "volumes": volumes},
            )

    total = sum(variants[item.variant_id].price_minor_uah * item.qty for item in payload.items)
    order = Order(
        owner_tg_id=tg_id,
        idempotency_key=key,
        name=payload.name,
        phone=payload.phone,
        city=city,
        branch=branch,
        comment=payload.comment,
        total_minor_uah=total,
    )
    for item in payload.items:
        order.items.append(
            OrderItem(
                variant_id=item.variant_id,
                qty=item.qty,
                price_minor_uah=variants[item.variant_id].price_minor_uah,
            )
        )
    session.add(order)
    try:
        await session.commit()
    except IntegrityError:
        # Lost a same-key race (concurrent double-POST) or hit an 8-hex
        # number collision: rollback, then disambiguate via our own key.
        await session.rollback()
        raced = (
            await session.execute(
                select(Order).where(
                    Order.owner_tg_id == tg_id, Order.idempotency_key == key
                )
            )
        ).scalar_one_or_none()
        if raced is not None:
            return JSONResponse(status_code=200, content={"number": raced.number})
        order.number = _short_number()
        session.add(order)
        await session.commit()
    await session.refresh(order)

    card = {
        "number": order.number,
        "items": [
            {
                "name": variants[item.variant_id].product.name,
                "volume_ml": variants[item.variant_id].volume_ml,
                "qty": item.qty,
                "price": variants[item.variant_id].price_minor_uah / 100,
            }
            for item in payload.items
        ],
        "total": total / 100,
        "name": order.name,
        "phone": order.phone,
        "city": order.city,
        "branch": order.branch,
        "comment": order.comment or "",
    }
    try:
        await notify.notify_new_order(card)
    except Exception:
        logger.exception("order notify failed")
    return JSONResponse(status_code=201, content={"number": order.number})


@router.get("/orders/mine", response_model=list[OrderOut])
async def list_mine(
    request: Request, session: AsyncSession = Depends(get_session)
) -> list[dict]:
    """Own orders for the validated initData identity."""
    tg_id = await get_current_tg_id(request)
    orders = (
        (
            await session.execute(
                select(Order)
                .options(selectinload(Order.items))
                .where(Order.owner_tg_id == tg_id)
                .order_by(Order.id.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_serialize(order) for order in orders]


@router.get("/orders/{number}", response_model=OrderOut)
async def get_order(
    number: str, request: Request, session: AsyncSession = Depends(get_session)
) -> dict:
    """Single order for owner-or-admin; 403 otherwise, 404 when missing."""
    tg_id = await get_current_tg_id(request)
    order = (
        await session.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.number == number)
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="order_not_found")
    if order.owner_tg_id != tg_id and tg_id not in await load_admin_ids(session):
        raise HTTPException(status_code=403, detail="forbidden")
    return _serialize(order)

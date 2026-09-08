"""Order DTOs: creation input (with idempotency) and order output."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from apps.api.models.order import OrderStatus


class OrderItemIn(BaseModel):
    """One requested line: variant + quantity."""

    variant_id: int
    qty: int = Field(ge=1)


class OrderCreate(BaseModel):
    """Create-order payload; retries reuse the same idempotency key."""

    idempotency_key: str = Field(min_length=1, max_length=64)
    items: list[OrderItemIn] = Field(min_length=1)


class OrderItemOut(BaseModel):
    """Persisted order line with snapshotted price."""

    model_config = ConfigDict(from_attributes=True)

    variant_id: int
    qty: int
    price_minor_uah: int


class OrderOut(BaseModel):
    """Order as returned to the buyer/admin."""

    model_config = ConfigDict(from_attributes=True)

    number: str
    status: OrderStatus
    ttn: str | None = None
    items: list[OrderItemOut] = []

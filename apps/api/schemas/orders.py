"""Order DTOs: server-authoritative checkout input and order output."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.api.models.order import OrderStatus

PHONE_RE = re.compile(r"^\+380\d{9}$")


def normalize_phone(raw: str) -> str:
    """Strip spaces/dashes/parens from a phone number."""
    return re.sub(r"[\s\-\(\)]", "", raw or "")


class OrderItemIn(BaseModel):
    """One requested line: variant + quantity."""

    variant_id: int
    qty: int = Field(ge=1, le=99)


class OrderCreate(BaseModel):
    """Checkout payload; idempotency travels via Idempotency-Key header.

    Extra fields are forbidden: the body has NO total field (server recomputes
    it), so sending `total` fails with 422.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=1, max_length=32)
    city: str = Field(min_length=1, max_length=120)
    branch: str = Field(min_length=1, max_length=120)
    comment: str | None = Field(default=None, max_length=500)
    items: list[OrderItemIn] = Field(min_length=1)

    @field_validator("name", "city", "branch", "comment")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        normalized = normalize_phone(value.strip())
        if not PHONE_RE.match(normalized):
            raise ValueError("phone must match +380XXXXXXXXX")
        return normalized


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
    total: int
    items: list[OrderItemOut] = []
    created: datetime

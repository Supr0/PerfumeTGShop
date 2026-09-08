"""Admin DTOs: products, order updates, settings, promo flag toggle."""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.api.models.order import OrderStatus
from apps.api.models.product import ALLOWED_VOLUMES

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{5,32}$")
MAX_USERNAMES = 20


class AdminOrderUpdate(BaseModel):
    """Admin mutation of an order: status transition and/or TTN."""

    status: OrderStatus | None = None
    ttn: str | None = Field(default=None, max_length=64)


class SettingUpsert(BaseModel):
    """Create or overwrite a configuration value."""

    model_config = ConfigDict(from_attributes=True)

    key: str = Field(min_length=1, max_length=100)
    value: str = Field(max_length=2000)


class PromoToggle(BaseModel):
    """Flip a promo banner's active flag."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool


class AdminVariantIn(BaseModel):
    """One volume offering on a product write; volume allowlist enforced."""

    volume_ml: int
    price_minor_uah: int = Field(ge=0)
    old_price_minor_uah: int | None = Field(default=None, ge=0)
    stock: int = Field(ge=0)

    @field_validator("volume_ml")
    @classmethod
    def _volume(cls, value: int) -> int:
        if value not in ALLOWED_VOLUMES:
            raise ValueError(f"volume_ml must be one of {ALLOWED_VOLUMES}")
        return value


class AdminProductCreate(BaseModel):
    """Create a product with its variants (photo maps to image)."""

    name: str = Field(min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=200)
    description: str | None = None
    image: str | None = Field(default=None, max_length=300)
    is_active: bool = True
    is_hit: bool = False
    variants: list[AdminVariantIn] = Field(min_length=1)


class AdminProductUpdate(BaseModel):
    """Partial product update; provided variants replace the full set."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=200)
    description: str | None = None
    image: str | None = Field(default=None, max_length=300)
    is_active: bool | None = None
    is_hit: bool | None = None
    variants: list[AdminVariantIn] | None = None


class AdminSettingsUpdate(BaseModel):
    """Upsert admin settings; usernames strictly validated."""

    dispatch_city: str | None = Field(default=None, min_length=1, max_length=120)
    card_requisites: str | None = Field(default=None, min_length=1, max_length=2000)
    payment_provider_key: str | None = Field(default=None, max_length=2000)
    usernames: list[str] | None = Field(default=None, max_length=MAX_USERNAMES)

    @field_validator("usernames")
    @classmethod
    def _usernames(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        if len(value) > MAX_USERNAMES:
            raise ValueError(f"at most {MAX_USERNAMES} usernames")
        for name in value:
            if not USERNAME_RE.match(name):
                raise ValueError(f"invalid username: {name}")
        return value


class AdminSettingsOut(BaseModel):
    """Admin view of settings incl. provider key (never exposed publicly)."""

    dispatch_city: str
    card_requisites: str
    payment_provider_key: str | None = None
    payment_enabled: bool = False
    usernames: list[str] = Field(default_factory=list)

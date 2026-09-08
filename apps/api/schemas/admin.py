"""Admin DTOs: order updates, setting upserts, promo flag toggle."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from apps.api.models.order import OrderStatus


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

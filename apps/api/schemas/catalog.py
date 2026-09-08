"""Catalog DTOs: product/variant shapes for the storefront."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class VariantOut(BaseModel):
    """One purchasable volume offering."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    volume_ml: int = Field(ge=1)
    price_minor_uah: int = Field(ge=0)
    old_price_minor_uah: int | None = Field(default=None, ge=0)
    stock: int = Field(ge=0)


class ProductOut(BaseModel):
    """Product with its active variants."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    brand: str | None = None
    description: str | None = None
    variants: list[VariantOut] = []

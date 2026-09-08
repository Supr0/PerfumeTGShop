"""Catalog models: Product + per-volume ProductVariant (price/stock live here)."""

from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.db.session import Base

ALLOWED_VOLUMES = (3, 5, 10)


class Product(Mapped, Base):
    """Sellable perfume; prices/stock live on variants, not here."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ProductVariant(Mapped, Base):
    """One volume offering of a product with its own price and stock."""

    __tablename__ = "product_variants"
    __table_args__ = (CheckConstraint("volume_ml IN (3, 5, 10)", name="ck_volume_ml"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    volume_ml: Mapped[int] = mapped_column(nullable=False)
    price_minor_uah: Mapped[int] = mapped_column(nullable=False)  # kopiyky
    old_price_minor_uah: Mapped[int | None] = mapped_column(nullable=True)
    stock: Mapped[int] = mapped_column(default=0, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="variants")

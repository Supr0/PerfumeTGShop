"""Order models: Order (short non-sequential number, idempotency) + OrderItem."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.db.session import Base


class OrderStatus(str, enum.Enum):
    """Order lifecycle states."""

    NEW = "new"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


def _short_number() -> str:
    return uuid.uuid4().hex[:8].upper()


class Order(Mapped, Base):
    """Customer order; number is a short non-sequential uuid fragment."""

    __tablename__ = "orders"
    # NOTE: no Alembic yet; create_all covers tests — add a migration when it lands.
    # Idempotency is per-owner: the same key reused by ANOTHER tg_id must 409,
    # never leak the first owner's number (see POST /v1/orders).
    __table_args__ = (
        UniqueConstraint(
            "owner_tg_id", "idempotency_key", name="uq_orders_owner_key"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    number: Mapped[str] = mapped_column(
        String(8), unique=True, nullable=False, default=_short_number
    )
    owner_tg_id: Mapped[int] = mapped_column(nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus), default=OrderStatus.NEW, nullable=False
    )
    ttn: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    city: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    branch: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    total_minor_uah: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Mapped, Base):
    """One line of an order with price snapshotted at purchase time."""

    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    qty: Mapped[int] = mapped_column(nullable=False)
    price_minor_uah: Mapped[int] = mapped_column(nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")

"""Order models: Order (short non-sequential number, idempotency) + OrderItem."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String
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

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    number: Mapped[str] = mapped_column(
        String(8), unique=True, nullable=False, default=_short_number
    )
    owner_tg_id: Mapped[int] = mapped_column(nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus), default=OrderStatus.NEW, nullable=False
    )
    ttn: Mapped[str | None] = mapped_column(String(64), nullable=True)

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

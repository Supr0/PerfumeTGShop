"""Misc models: key/value Setting + Promo (fields + active flag only)."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db.session import Base


class Setting(Mapped, Base):
    """Generic key/value store for shop configuration."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(2000), nullable=False)


class Promo(Mapped, Base):
    """Promo banner: content fields plus an active flag, nothing more."""

    __tablename__ = "promos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=False, nullable=False)

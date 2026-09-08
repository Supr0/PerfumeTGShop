"""Manual-card payments stub (MVP).

- Card requisites shown to the buyer are plain display text.
- Online providers (LiqPay / WayForPay / Mono) share one stub interface gated
  by an enabled flag that is always False on MVP.
- The provider key is read from the Setting store only and is never returned
  in any payload built here.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.misc import Setting

PROVIDER_KEY_SETTING = "payment_provider_key"
PAYMENT_ENABLED = False


def build_card_instructions(card_requisites: str, total_minor_uah: int) -> str:
    """Human-readable manual-card payment instructions (no secrets inside)."""
    total_uah = total_minor_uah / 100
    return (
        f"Сплатіть {total_uah:.2f} ₴ на картку:\n{card_requisites}\n"
        "Після оплати менеджер підтвердить замовлення."
    )


async def load_provider_key(session: AsyncSession) -> str | None:
    """Read the provider key from Setting; caller must never expose it."""
    setting = await session.get(Setting, PROVIDER_KEY_SETTING)
    return setting.value if setting is not None else None


PUBLIC_SETTINGS_KEYS = ("dispatch_city", "card_requisites")


async def public_settings_map(session: AsyncSession) -> dict[str, str]:
    """Public Setting rows only (allowlist query; secrets never leave the DB)."""
    rows = (
        await session.execute(
            select(Setting).where(Setting.key.in_(PUBLIC_SETTINGS_KEYS))
        )
    ).scalars().all()
    return {row.key: row.value for row in rows}


class ProviderStub:
    """Disabled stand-in for LiqPay / WayForPay / Mono on MVP."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.enabled = PAYMENT_ENABLED

    async def create_payment(self, total_minor_uah: int, order_number: str) -> dict:
        """Always reports disabled; never touches provider keys."""
        _ = (total_minor_uah, order_number)
        return {"ok": False, "provider": self.name, "reason": "disabled"}

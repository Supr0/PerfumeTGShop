"""Public shop settings (R-13): display values only, never secrets."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db.session import get_session
from apps.api.services.payments_stub import public_settings_map

router = APIRouter(prefix="/v1/settings", tags=["settings"])

DEFAULT_DISPATCH_CITY = "Львів"
DEFAULT_CARD_REQUISITES = (
    "Оплата на картку: реквізити надасть менеджер після підтвердження замовлення."
)


class PublicSettings(BaseModel):
    """Buyer-safe settings subset (no secret keys)."""

    dispatch_city: str
    card_requisites: str
    payment_enabled: bool


@router.get("/public", response_model=PublicSettings)
async def get_public_settings(
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Public subset: dispatch city, card text, provider flag (always False)."""
    stored = await public_settings_map(session)
    return {
        "dispatch_city": stored.get("dispatch_city", DEFAULT_DISPATCH_CITY),
        "card_requisites": stored.get("card_requisites", DEFAULT_CARD_REQUISITES),
        "payment_enabled": False,
    }

"""Best-effort admin notification for new orders (commit-before-notify).

The order row is committed BEFORE this is called; failures here are logged
and never roll back the order. This function never raises.
"""

from __future__ import annotations

import asyncio
import logging
import os

logger = logging.getLogger(__name__)


async def notify_new_order(order: dict) -> bool:
    """Format the admin card and send it via the bot sender. Never raises."""
    try:
        from apps.api.core.config import settings
        from apps.bot.bot import format_order_card, send_card

        text = format_order_card(order)
        token = os.environ.get("BOT_TOKEN", "") or settings.bot_token
        chat_id: object = settings.admin_ids[0] if settings.admin_ids else ""
        if not token or chat_id == "":
            logger.info("notify skipped: no admin chat configured")
            return False
        return await asyncio.to_thread(send_card, token, chat_id, text)
    except Exception:
        logger.exception("notify_new_order failed")
        return False

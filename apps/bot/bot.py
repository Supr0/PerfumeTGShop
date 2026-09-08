"""Telegram admin order notifier (R-15).

Stdlib only — zero third-party dependencies.

- :func:`format_order_card` builds a plain-text admin card. ALL free text
  is backslash-escaped (Telegram MarkdownV2 special chars) so the card is
  safe to send even if a ``parse_mode`` is ever added; by default callers
  send it as plain text (no ``parse_mode``).
- :func:`send_card` POSTs the card to the Bot API ``sendMessage`` endpoint.
  Best-effort: never raises on network/API errors, returns ``False``.

The bot token is passed in by the caller and MUST come from the
``BOT_TOKEN`` environment variable — never hardcoded, never logged.
"""

from __future__ import annotations

import json
import urllib.request

API_BASE = "https://api.telegram.org"
REQUEST_TIMEOUT_SECONDS = 10

# Telegram MarkdownV2 special chars (+ backslash as the escape char itself).
_ESCAPE_CHARS = frozenset("\\*_[]()~`><#+-=|{}.!")

# Module-level alias so tests can mock `bot.urlopen`; delegates to
# urllib at call time so mocking `urllib.request.urlopen` works too.
def urlopen(request, *args, **kwargs):
    """Delegate to :func:`urllib.request.urlopen` (mock point for tests)."""
    return urllib.request.urlopen(request, *args, **kwargs)


def _escape(text: object) -> str:
    """Backslash-escape MarkdownV2 special chars in free text."""
    s = "" if text is None else str(text)
    return "".join(f"\\{ch}" if ch in _ESCAPE_CHARS else ch for ch in s)


def format_order_card(order: dict) -> str:
    """Build a plain-text admin card for an order dict.

    Expected keys: ``number``, ``items`` (list of ``{name, volume_ml,
    qty, price}``), ``total``, ``name``, ``phone``, ``city``,
    ``branch``, ``comment``. Missing keys render as empty; all free
    text is escaped.
    """
    number = _escape(order.get("number", ""))
    lines = [f"New order {number}", ""]

    items = order.get("items") or []
    for item in items:
        name = _escape(item.get("name", ""))
        volume = item.get("volume_ml", item.get("volume", ""))
        qty = item.get("qty", item.get("quantity", ""))
        price = item.get("price", "")
        lines.append(f"- {name}: {volume}ml x {qty} = {price} ₴")

    lines.append(f"Total: {order.get('total', '')} ₴")
    lines.append(f"Name: {_escape(order.get('name', ''))}")
    lines.append(f"Phone: {_escape(order.get('phone', ''))}")
    lines.append(f"City: {_escape(order.get('city', ''))}")
    lines.append(f"Branch: {_escape(order.get('branch', ''))}")
    comment = _escape(order.get("comment", ""))
    lines.append(f"Comment: {comment}")
    return "\n".join(lines)


def send_card(bot_token: str, chat_id: object, text: str) -> bool:
    """POST text to Bot API sendMessage. Returns True/False, never raises.

    ``bot_token`` must come from the ``BOT_TOKEN`` env var (caller side).
    No ``parse_mode`` is set — the card is sent as plain text.
    """
    if not bot_token or chat_id is None or chat_id == "" or text is None:
        return False
    url = f"{API_BASE}/bot{bot_token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            return True
        if isinstance(data, dict) and "ok" in data:
            return bool(data["ok"])
        return True
    except Exception:
        return False

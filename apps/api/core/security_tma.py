"""Telegram WebApp initData validation (trust boundary).

BEHAVIOR: validate_init_data(init_data: str, bot_token: str) -> dict parses
query-string initData, rebuilds data_check_string as "\\n".join(sorted("k=v"
for all fields except hash)), derives secret = HMAC_SHA256(key="WebAppData",
msg=bot_token), compares the hex digest via hmac.compare_digest, and rejects
missing/future auth_date plus age > MAX_AUTH_AGE_SECONDS (UTC). Returns the
parsed fields (without hash) on success; raises ValueError otherwise. The
bot token is never logged.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import parse_qsl

MAX_AUTH_AGE_SECONDS = 3600

_SECRET_KEY = b"WebAppData"


def validate_init_data(init_data: str, bot_token: str) -> dict[str, str]:
    """Validate Telegram WebApp initData and return parsed fields (minus hash)."""
    if not init_data or not bot_token:
        raise ValueError("init_data and bot_token are required")
    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = fields.pop("hash", "")
    if not received_hash:
        raise ValueError("missing hash")
    _check_auth_date(fields.get("auth_date"))
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(_SECRET_KEY, bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError("invalid hash")
    return fields


def _check_auth_date(auth_date: str | None) -> None:
    if not auth_date:
        raise ValueError("missing auth_date")
    try:
        auth_ts = int(auth_date)
    except (TypeError, ValueError):
        raise ValueError("invalid auth_date") from None
    now = int(time.time())
    if auth_ts > now:
        raise ValueError("auth_date is in the future")
    if now - auth_ts > MAX_AUTH_AGE_SECONDS:
        raise ValueError("auth_date expired")

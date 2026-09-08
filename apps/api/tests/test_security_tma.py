"""RED: Telegram WebApp initData validation contract.

Spec: validate_init_data(init_data: str, bot_token: str) -> dict
  - parses query-string initData
  - rebuilds data_check_string as "\\n".join(sorted("k=v" for all fields except hash))
  - secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
  - compares via hmac.compare_digest
  - rejects missing/future auth_date and age > 3600s (UTC)
"""

from __future__ import annotations

import hashlib
import hmac
import time
from unittest.mock import patch
from urllib.parse import urlencode

import pytest

from apps.api.core.security_tma import validate_init_data

BOT_TOKEN = "123456:TEST-TOKEN_abcdef"
MAX_AGE = 3600


def _sign(fields: dict[str, str], bot_token: str) -> str:
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    return hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()


def _make_init_data(fields: dict[str, str], bot_token: str = BOT_TOKEN) -> str:
    signed = dict(fields)
    signed["hash"] = _sign(fields, bot_token)
    return urlencode(signed)


def _base_fields(auth_date: int | None = None) -> dict[str, str]:
    return {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "query_id": "AAETESTQUERY",
        "user": '{"id":918312403,"first_name":"Test"}',
    }


def test_valid_vector_returns_parsed_dict() -> None:
    init_data = _make_init_data(_base_fields())
    result = validate_init_data(init_data, BOT_TOKEN)
    assert result["query_id"] == "AAETESTQUERY"
    assert "hash" not in result
    assert int(result["auth_date"]) > 0  # parsed as-is, int-parseable unix ts
    assert '"id":918312403' in result["user"] or '"id": 918312403' in result["user"]


def test_tampered_hash_rejected() -> None:
    fields = _base_fields()
    init_data = _make_init_data(fields)
    tampered = init_data.replace("query_id=AAETESTQUERY", "query_id=HACKED")
    with pytest.raises(ValueError):
        validate_init_data(tampered, BOT_TOKEN)


def test_stale_auth_date_rejected() -> None:
    stale = int(time.time()) - (MAX_AGE + 60)
    init_data = _make_init_data(_base_fields(auth_date=stale))
    with pytest.raises(ValueError):
        validate_init_data(init_data, BOT_TOKEN)


def test_missing_auth_date_rejected() -> None:
    fields = _base_fields()
    del fields["auth_date"]
    init_data = _make_init_data(fields)
    with pytest.raises(ValueError):
        validate_init_data(init_data, BOT_TOKEN)


def test_future_auth_date_rejected() -> None:
    future = int(time.time()) + 600
    init_data = _make_init_data(_base_fields(auth_date=future))
    with pytest.raises(ValueError):
        validate_init_data(init_data, BOT_TOKEN)


def test_wrong_bot_token_rejected() -> None:
    init_data = _make_init_data(_base_fields())
    with pytest.raises(ValueError):
        validate_init_data(init_data, "999999:WRONG-TOKEN")


def test_missing_hash_rejected() -> None:
    init_data = urlencode(_base_fields())
    with pytest.raises(ValueError):
        validate_init_data(init_data, BOT_TOKEN)


def test_empty_init_data_rejected() -> None:
    with pytest.raises(ValueError):
        validate_init_data("", BOT_TOKEN)


# --- Independent spec-lock vector (C1) ---
#
# Generated OFFLINE with a scratch script using ONLY stdlib hmac/hashlib
# (never importing app code), then pasted here as literals:
#   fields = {"auth_date": "1788893900", "query_id": "AAESPECLOCK",
#             "user": '{"id":918312403,"first_name":"Spec"}'}
#   data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields))
#   secret = HMAC_SHA256(key=b"WebAppData", msg=BOT_TOKEN)
#   hash = HMAC_SHA256(key=secret, msg=data_check_string).hexdigest()
# This locks the official Telegram spec (plain "k=v", NO angle brackets):
# if the impl ever reintroduces "<v>", this vector fails even though the
# self-consistent _sign helper above would still mirror the bug.
# time.time is frozen so the literal auth_date never goes stale.

_FROZEN_NOW = 1788894000
_SPEC_LOCK_INIT_DATA = (
    "auth_date=1788893900&query_id=AAESPECLOCK"
    "&user=%7B%22id%22%3A918312403%2C%22first_name%22%3A%22Spec%22%7D"
    "&hash=a64c946ada513d0afc5df179aa48a7075866f6bcaee05e45c4df31594d073368"
)


def test_independent_spec_vector_accepts_plain_k_eq_v() -> None:
    with patch("time.time", return_value=_FROZEN_NOW):
        result = validate_init_data(_SPEC_LOCK_INIT_DATA, BOT_TOKEN)
    assert result["query_id"] == "AAESPECLOCK"
    assert result["auth_date"] == "1788893900"
    assert "hash" not in result

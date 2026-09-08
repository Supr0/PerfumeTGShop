"""RED: Telegram WebApp initData validation contract.

Spec: validate_init_data(init_data: str, bot_token: str) -> dict
  - parses query-string initData
  - rebuilds data_check_string as "\\n".join(sorted("k=<v>" for all fields except hash))
  - secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
  - compares via hmac.compare_digest
  - rejects missing/future auth_date and age > 3600s (UTC)
"""

from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode

import pytest

from apps.api.core.security_tma import validate_init_data

BOT_TOKEN = "123456:TEST-TOKEN_abcdef"
MAX_AGE = 3600


def _sign(fields: dict[str, str], bot_token: str) -> str:
    data_check_string = "\n".join(f"{k}=<{v}>" for k, v in sorted(fields.items()))
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

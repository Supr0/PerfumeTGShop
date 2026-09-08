"""Tests for Telegram admin order notifier (R-15). stdlib only."""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bot


class _FakeResp:
    """Minimal context-manager stub for urlopen responses."""

    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_escape_all_special_chars():
    expected = set("\\*_[]()~`><#+-=|{}.!")
    assert set(bot._ESCAPE_CHARS) == expected
    for ch in expected:
        assert bot._escape(ch) == "\\" + ch, f"char {ch!r} not escaped"


def test_escape_plain_text_untouched():
    assert bot._escape("hello ABC 123") == "hello ABC 123"
    assert bot._escape("") == ""
    assert bot._escape(None) == ""


def test_format_order_card_fields_present():
    order = {
        "number": "A-1001",
        "items": [{"name": "Noir Absolu", "volume_ml": 5, "qty": 2, "price": 450}],
        "total": 900,
        "name": "Olena",
        "phone": "+380501234567",
        "city": "Kyiv",
        "branch": "12",
        "comment": "call after 18",
    }
    card = bot.format_order_card(order)
    assert "A\\-1001" in card
    assert "Noir Absolu" in card
    assert "5ml x 2 = 450" in card
    assert "Total: 900" in card
    assert "Name: Olena" in card
    assert "Phone:" in card and "\\+380501234567" in card
    assert "City: Kyiv" in card
    assert "Branch: 12" in card
    assert "Comment: call after 18" in card


def test_format_order_card_escapes_free_text():
    order = {
        "number": "A(1)",
        "items": [{"name": "a*b_c", "volume_ml": 3, "qty": 1, "price": 100}],
        "total": 100,
        "name": "a>b",
        "phone": "+38050",
        "city": "Kyiv",
        "branch": "1",
        "comment": "a+b=c!",
    }
    card = bot.format_order_card(order)
    assert "A\\(1\\)" in card
    assert "a\\*b\\_c" in card
    assert "a\\>b" in card
    assert "a\\+b\\=c\\!" in card


def test_send_card_exact_endpoint_url():
    captured = {}

    def fake_urlopen(request, *args, **kwargs):
        captured["url"] = request.full_url
        return _FakeResp(b'{"ok": true}')

    with mock.patch.object(urllib.request, "urlopen", fake_urlopen):
        assert bot.send_card("TOKEN123", 777, "hello") is True
    assert captured["url"] == "https://api.telegram.org/botTOKEN123/sendMessage"


def test_send_card_payload_has_no_parse_mode():
    captured = {}

    def fake_urlopen(request, *args, **kwargs):
        captured["request"] = request
        return _FakeResp(b'{"ok": true}')

    with mock.patch.object(urllib.request, "urlopen", fake_urlopen):
        assert bot.send_card("TOKEN123", 777, "hello") is True
    payload = json.loads(captured["request"].data.decode("utf-8"))
    assert payload == {"chat_id": 777, "text": "hello"}
    assert "parse_mode" not in payload


def test_send_card_true_on_ok_true():
    with mock.patch.object(
        urllib.request, "urlopen", lambda *a, **k: _FakeResp(b'{"ok": true}')
    ):
        assert bot.send_card("TOKEN123", 777, "hello") is True


def _raises(exc):
    def fake_urlopen(request, *args, **kwargs):
        raise exc

    return fake_urlopen


def test_send_card_false_on_urlerror():
    with mock.patch.object(
        urllib.request, "urlopen", _raises(urllib.error.URLError("boom"))
    ):
        assert bot.send_card("TOKEN123", 777, "hello") is False


def test_send_card_false_on_timeout():
    with mock.patch.object(
        urllib.request, "urlopen", _raises(TimeoutError("timed out"))
    ):
        assert bot.send_card("TOKEN123", 777, "hello") is False


def test_send_card_false_on_generic_exception():
    with mock.patch.object(
        urllib.request, "urlopen", _raises(RuntimeError("boom"))
    ):
        assert bot.send_card("TOKEN123", 777, "hello") is False


def test_send_card_false_on_ok_false():
    with mock.patch.object(
        urllib.request,
        "urlopen",
        lambda *a, **k: _FakeResp(b'{"ok": false, "description": "bad"}'),
    ):
        assert bot.send_card("TOKEN123", 777, "hello") is False


def test_send_card_false_on_empty_token():
    with mock.patch.object(
        urllib.request,
        "urlopen",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not call")),
    ):
        assert bot.send_card("", 777, "hello") is False

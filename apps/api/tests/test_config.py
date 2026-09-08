"""Config parsing contract (L2): ADMIN_IDS accepts every common env form.

Choices documented here:
  - bare "918312403" / CSV "1,2" / JSON "[1,2]" / mixed "1;2 3" all parse.
  - invalid ("not-an-id", "[1,\"x\"]", "") -> [] (fail-closed: an env typo
    never grants admin access and never crashes startup).
"""

from __future__ import annotations

from apps.api.core.config import Settings


def test_bare_id() -> None:
    assert Settings(admin_ids="918312403").admin_ids == [918312403]  # type: ignore[arg-type]


def test_bare_id_as_json_list() -> None:
    assert Settings(admin_ids="[918312403]").admin_ids == [918312403]  # type: ignore[arg-type]


def test_csv() -> None:
    assert Settings(admin_ids="1,2").admin_ids == [1, 2]  # type: ignore[arg-type]


def test_csv_with_spaces() -> None:
    assert Settings(admin_ids="1, 2 ,3").admin_ids == [1, 2, 3]  # type: ignore[arg-type]


def test_json_list() -> None:
    assert Settings(admin_ids="[1,2]").admin_ids == [1, 2]  # type: ignore[arg-type]


def test_semicolon_and_space_separated() -> None:
    assert Settings(admin_ids="1;2 3").admin_ids == [1, 2, 3]  # type: ignore[arg-type]


def test_list_passthrough() -> None:
    assert Settings(admin_ids=[1, 2]).admin_ids == [1, 2]


def test_invalid_string_is_empty_fail_closed() -> None:
    assert Settings(admin_ids="not-an-id").admin_ids == []  # type: ignore[arg-type]


def test_invalid_json_list_is_empty_fail_closed() -> None:
    assert Settings(admin_ids='[1,"x"]').admin_ids == []  # type: ignore[arg-type]


def test_empty_string_is_empty() -> None:
    assert Settings(admin_ids="").admin_ids == []  # type: ignore[arg-type]

"""Static Nova Poshta directory + manual-entry passthrough.

MVP has no live NP API: a static top-cities list plus a small branches sample
covers suggestions, while any manual city/branch text passes through after
control-character stripping and a <=120 char length check.
"""

from __future__ import annotations

import re

MAX_LOCATION_LEN = 120

TOP_CITIES = [
    "Київ",
    "Харків",
    "Одеса",
    "Дніпро",
    "Львів",
    "Запоріжжя",
    "Вінниця",
    "Чернігів",
    "Полтава",
    "Черкаси",
]

SAMPLE_BRANCHES: dict[str, list[str]] = {
    "Львів": ["Відділення №7", "Відділення №25", "Поштомат №3101"],
    "Київ": ["Відділення №3", "Відділення №118", "Поштомат №2204"],
}

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def _clean(value: str, field: str) -> str:
    cleaned = _CONTROL_CHARS_RE.sub("", value or "").strip()
    if not cleaned:
        raise ValueError(f"{field} must not be empty")
    if len(cleaned) > MAX_LOCATION_LEN:
        raise ValueError(f"{field} must be at most {MAX_LOCATION_LEN} chars")
    return cleaned


def normalize_city(city: str) -> str:
    """Accept top-city or free-text manual entry after validation."""
    return _clean(city, "city")


def normalize_branch(branch: str) -> str:
    """Accept sample-branch or free-text manual entry after validation."""
    return _clean(branch, "branch")


def lookup_branches(city: str) -> list[str]:
    """Static branch suggestions for a city; [] when unknown (manual entry)."""
    return list(SAMPLE_BRANCHES.get((city or "").strip(), []))

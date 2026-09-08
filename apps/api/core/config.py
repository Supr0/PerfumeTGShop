"""Application settings — environment only, never hardcoded secrets."""

from __future__ import annotations

import json
import re

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    bot_token: str = ""
    admin_ids: list[int] = []
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/perfume"

    @field_validator("admin_ids", mode="before")
    @classmethod
    def _split_admin_ids(cls, v: object) -> list[int]:
        """Parse ADMIN_IDS from any common env form.

        Accepted: JSON list "[1,2]", bare "918312403", CSV "1,2",
        semicolon/space separated "1;2 3". (Note: pydantic-settings
        JSON-decodes complex fields itself, so v may already arrive as
        a list or int — both are handled.)
        Invalid input -> [] (fail-closed: an env typo never grants
        admin access and never crashes startup).
        """
        if v is None:
            return []
        if isinstance(v, bool):
            return []
        if isinstance(v, int):
            return [v]
        if isinstance(v, list):
            try:
                return [int(x) for x in v]
            except (TypeError, ValueError):
                return []
        if isinstance(v, str):
            text = v.strip()
            if not text:
                return []
            try:
                parsed: object = json.loads(text)
            except ValueError:
                parsed = None
            if isinstance(parsed, list):
                try:
                    return [int(x) for x in parsed]
                except (TypeError, ValueError):
                    return []
            if isinstance(parsed, int) and not isinstance(parsed, bool):
                return [parsed]
            try:
                return [int(x) for x in re.split(r"[,\s;]+", text) if x.strip()]
            except ValueError:
                return []
        return []


settings = Settings()

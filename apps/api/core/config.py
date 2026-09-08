"""Application settings — environment only, never hardcoded secrets."""

from __future__ import annotations

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
        if isinstance(v, str):
            return [int(x) for x in v.split(",") if x.strip()]
        if isinstance(v, list):
            return [int(x) for x in v]
        return []


settings = Settings()

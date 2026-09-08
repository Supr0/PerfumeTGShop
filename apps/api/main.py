"""FastAPI application skeleton; routers attach in later waves."""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="PerfumeTGShop API")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}

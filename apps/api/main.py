"""FastAPI application skeleton; routers attach in later waves."""

from __future__ import annotations

from fastapi import FastAPI

from apps.api.routers.admin import router as admin_router
from apps.api.routers.orders import router as orders_router
from apps.api.routers.settings import router as settings_router

app = FastAPI(title="PerfumeTGShop API")
app.include_router(admin_router)
app.include_router(orders_router)
app.include_router(settings_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}

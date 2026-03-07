from __future__ import annotations

from fastapi import FastAPI

from app.modules.auth.router import router as auth_router
from app.modules.health.router import router as health_router
from app.modules.models.router import router as models_router
from app.modules.video.router import router as video_router


def register_routers(app: FastAPI) -> None:
    app.include_router(auth_router)
    app.include_router(health_router)
    app.include_router(models_router)
    app.include_router(video_router)

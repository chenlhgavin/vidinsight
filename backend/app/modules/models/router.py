from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.schemas.shared import TextModelInfo
from app.services.video import VideoService

router = APIRouter(tags=["models"])


def get_service(request: Request) -> VideoService:
    return request.app.state.video_service


@router.get("/api/models", response_model=list[TextModelInfo])
async def list_models(service: VideoService = Depends(get_service)):
    return await service.list_models()

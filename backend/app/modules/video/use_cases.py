from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request

from app.repositories.video_note import VideoNoteRepository
from app.services.translation import TranslationService

from .schemas import (
    VideoAnalyzeRequest,
    VideoCheckCacheRequest,
    VideoChatRequest,
    VideoConversationCreate,
    VideoExploreThemeRequest,
    VideoNoteCreate,
    VideoTranslateRequest,
)
from .service import VideoService


def get_service(request: Request) -> VideoService:
    return request.app.state.video_service


def get_translation_service(request: Request) -> TranslationService:
    return request.app.state.translation_service


def get_note_repository(request: Request) -> VideoNoteRepository:
    return request.app.state.video_note_repository


async def list_conversations(service: VideoService) -> list[dict]:
    return await service.list_conversations()


async def create_conversation(service: VideoService, req: VideoConversationCreate) -> dict:
    return await service.create_conversation(req)


async def get_conversation(service: VideoService, conversation_id: str) -> dict:
    return await service.get_conversation(conversation_id)


async def delete_conversation(service: VideoService, conversation_id: str) -> dict:
    return await service.delete_conversation(conversation_id)


async def check_cache(service: VideoService, req: VideoCheckCacheRequest) -> dict:
    return await service.check_cache(req)


def stream_analyze(service: VideoService, req: VideoAnalyzeRequest) -> AsyncIterator[dict]:
    return service.stream_analyze(req)


def stream_chat(service: VideoService, req: VideoChatRequest) -> AsyncIterator[dict]:
    return service.stream_chat(req)


def stream_explore_theme(service: VideoService, req: VideoExploreThemeRequest) -> AsyncIterator[dict]:
    return service.stream_explore_theme(req)


async def translate_batch(
    service: TranslationService, req: VideoTranslateRequest
) -> dict:
    translations = await service.translate_batch(
        req.texts, req.target_language, req.context
    )
    return {"translations": translations}


async def list_notes(repo: VideoNoteRepository, conversation_id: str) -> list[dict]:
    return await repo.list_by_conversation(conversation_id)


async def create_note(repo: VideoNoteRepository, req: VideoNoteCreate) -> dict:
    return await repo.create(
        conversation_id=req.conversation_id,
        source=req.source.value,
        text=req.text,
        source_id=req.source_id,
        metadata=req.metadata,
    )


async def delete_note(repo: VideoNoteRepository, note_id: str) -> dict:
    deleted = await repo.delete(note_id)
    return {"ok": deleted}

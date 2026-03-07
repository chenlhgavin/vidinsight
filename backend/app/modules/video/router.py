from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request, Response

from app.modules.common import message_summary, sse_response
from . import use_cases
from app.services.translation import TranslationService

from app.repositories.video_note import VideoNoteRepository

from .schemas import (
    ConversationSummary,
    DeleteResponse,
    VideoAnalyzeRequest,
    VideoCheckCacheRequest,
    VideoChatRequest,
    VideoConversationCreate,
    VideoConversationDetail,
    VideoExploreThemeRequest,
    VideoNoteCreate,
    VideoNoteResponse,
    VideoTranslateRequest,
    VideoTranslateResponse,
)
from .service import VideoService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["video"])


@router.post("/api/video/check-cache")
async def check_video_cache(
    req: VideoCheckCacheRequest,
    service: VideoService = Depends(use_cases.get_service),
):
    return await use_cases.check_cache(service, req)


@router.get("/api/video/conversations", response_model=list[ConversationSummary])
async def list_video_conversations(service: VideoService = Depends(use_cases.get_service)):
    return await use_cases.list_conversations(service)


@router.post("/api/video/conversations", response_model=ConversationSummary)
async def create_video_conversation(
    req: VideoConversationCreate,
    service: VideoService = Depends(use_cases.get_service),
):
    return await use_cases.create_conversation(service, req)


@router.get("/api/video/conversations/{conversation_id}", response_model=VideoConversationDetail)
async def get_video_conversation(
    conversation_id: str,
    response: Response,
    service: VideoService = Depends(use_cases.get_service),
):
    response.headers["Cache-Control"] = "no-store"
    return await use_cases.get_conversation(service, conversation_id)


@router.delete("/api/video/conversations/{conversation_id}", response_model=DeleteResponse)
async def delete_video_conversation(
    conversation_id: str,
    service: VideoService = Depends(use_cases.get_service),
):
    return await use_cases.delete_conversation(service, conversation_id)


@router.post("/api/video/analyze")
async def video_analyze(
    req: VideoAnalyzeRequest,
    request: Request,
    service: VideoService = Depends(use_cases.get_service),
):
    logger.info(
        "video_analyze_request request_id=%s url=%r",
        getattr(request.state, "request_id", "-"),
        req.url,
    )
    return sse_response(use_cases.stream_analyze(service, req))


@router.post("/api/video/chat")
async def video_chat(
    req: VideoChatRequest,
    request: Request,
    service: VideoService = Depends(use_cases.get_service),
):
    message_len, message_preview = message_summary(req.message)
    logger.info(
        "video_chat_request request_id=%s conversation_id=%s message_len=%s message_preview=%r",
        getattr(request.state, "request_id", "-"),
        req.conversation_id,
        message_len,
        message_preview,
    )
    return sse_response(use_cases.stream_chat(service, req))


@router.post("/api/video/explore-theme")
async def video_explore_theme(
    req: VideoExploreThemeRequest,
    request: Request,
    service: VideoService = Depends(use_cases.get_service),
):
    logger.info(
        "video_explore_request request_id=%s conversation_id=%s theme=%r",
        getattr(request.state, "request_id", "-"),
        req.conversation_id,
        req.theme,
    )
    return sse_response(use_cases.stream_explore_theme(service, req))


@router.post("/api/video/translate", response_model=VideoTranslateResponse)
async def video_translate(
    req: VideoTranslateRequest,
    request: Request,
    service: TranslationService = Depends(use_cases.get_translation_service),
):
    logger.info(
        "video_translate_request request_id=%s texts_count=%d target_language=%s",
        getattr(request.state, "request_id", "-"),
        len(req.texts),
        req.target_language,
    )
    return await use_cases.translate_batch(service, req)


@router.get("/api/video/notes", response_model=list[VideoNoteResponse])
async def list_video_notes(
    conversation_id: str,
    repo: VideoNoteRepository = Depends(use_cases.get_note_repository),
):
    return await use_cases.list_notes(repo, conversation_id)


@router.post("/api/video/notes", response_model=VideoNoteResponse)
async def create_video_note(
    req: VideoNoteCreate,
    repo: VideoNoteRepository = Depends(use_cases.get_note_repository),
):
    return await use_cases.create_note(repo, req)


@router.delete("/api/video/notes/{note_id}", response_model=DeleteResponse)
async def delete_video_note(
    note_id: str,
    repo: VideoNoteRepository = Depends(use_cases.get_note_repository),
):
    return await use_cases.delete_note(repo, note_id)

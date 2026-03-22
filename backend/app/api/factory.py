from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import Settings
from app.core.errors import register_exception_handlers
from app.providers import TextProviderRegistry, build_default_text_provider_registry
from app.modules.auth.middleware import AuthMiddleware
from app.modules.auth.service import seed_default_user
from app.repositories.conversation_message import ConversationMessageRepository
from app.repositories.user import UserRepository
from app.repositories.video_metadata import VideoMetadataRepository
from app.repositories.video_note import VideoNoteRepository
from app.services import TranslationService, VideoService

from .router_registry import register_routers

logger = logging.getLogger(__name__)

APP_TITLE = "VidInsight"
APP_DESCRIPTION = "Video Insight - AI驱动的YouTube视频分析工具"


def _configure_app_logging() -> None:
    app_logger = logging.getLogger("app")
    app_logger.setLevel(logging.INFO)

    handler_sources = [logging.getLogger("uvicorn"), logging.getLogger("uvicorn.error")]
    existing_handler_ids = {id(handler) for handler in app_logger.handlers}
    for source_logger in handler_sources:
        for handler in source_logger.handlers:
            if id(handler) not in existing_handler_ids:
                app_logger.addHandler(handler)
                existing_handler_ids.add(id(handler))

    logging.getLogger("uvicorn.access").disabled = True


def _build_repositories(database_url: str) -> tuple[
    AsyncEngine,
    ConversationMessageRepository,
    VideoMetadataRepository,
    VideoNoteRepository,
    UserRepository,
]:
    engine = create_async_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=5,
        pool_recycle=1800,
    )
    return (
        engine,
        ConversationMessageRepository(engine),
        VideoMetadataRepository(engine),
        VideoNoteRepository(engine),
        UserRepository(engine),
    )


def _unique_by_identity(objects: list[object]) -> list[object]:
    seen: set[int] = set()
    unique: list[object] = []
    for item in objects:
        obj_id = id(item)
        if obj_id in seen:
            continue
        seen.add(obj_id)
        unique.append(item)
    return unique


async def _call_optional_lifecycle(resource: object, method_name: str) -> None:
    method = getattr(resource, method_name, None)
    if not callable(method):
        return
    maybe_awaitable = method()
    if maybe_awaitable is not None:
        await maybe_awaitable


def create_app(
    *,
    settings: Settings | None = None,
    text_provider_registry: TextProviderRegistry | None = None,
    conversation_repository: ConversationMessageRepository | None = None,
    video_metadata_repository: VideoMetadataRepository | None = None,
    video_note_repository: VideoNoteRepository | None = None,
    user_repository: UserRepository | None = None,
) -> FastAPI:
    app_settings = settings or Settings.from_env()

    engine: AsyncEngine | None = None
    if (
        conversation_repository is None
        or video_metadata_repository is None
        or video_note_repository is None
        or user_repository is None
    ):
        engine, default_messages, default_metadata, default_notes, default_users = (
            _build_repositories(app_settings.database_url)
        )
        conversation_repository = conversation_repository or default_messages
        video_metadata_repository = video_metadata_repository or default_metadata
        video_note_repository = video_note_repository or default_notes
        user_repository = user_repository or default_users

    text_registry = text_provider_registry or build_default_text_provider_registry(app_settings)
    managed_resources = _unique_by_identity(
        [conversation_repository, video_metadata_repository, video_note_repository, user_repository]
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        _configure_app_logging()

        for resource in managed_resources:
            await _call_optional_lifecycle(resource, "initialize")

        app.state.settings = app_settings
        app.state.user_repo = user_repository
        app.state.video_note_repository = video_note_repository

        if app_settings.auth_enabled:
            await seed_default_user(user_repository, app_settings)

        app.state.video_service = VideoService(
            conversation_repository,
            video_metadata_repository,
            text_registry,
            app_settings,
        )
        app.state.translation_service = TranslationService(text_registry, app_settings)

        logger.info("%s backend ready", APP_TITLE)
        yield

        await text_registry.close()
        if engine is not None:
            await engine.dispose()

    app = FastAPI(
        title=APP_TITLE,
        description=APP_DESCRIPTION,
        lifespan=lifespan,
    )
    register_exception_handlers(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=app_settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if app_settings.auth_enabled:
        app.add_middleware(AuthMiddleware, settings=app_settings)

    @app.middleware("http")
    async def log_api_requests(request: Request, call_next):
        request_id = uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        start_time = perf_counter()
        status_code = 500

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = (perf_counter() - start_time) * 1000
            # Docker Compose healthcheck hits /healthz frequently; skip noisy logs on success.
            if not (request.url.path == "/healthz" and status_code < 400):
                logger.info(
                    "api_request request_id=%s %s %s %s %.0fms",
                    request_id,
                    request.method,
                    request.url.path,
                    status_code,
                    duration_ms,
                )

    register_routers(app)
    return app

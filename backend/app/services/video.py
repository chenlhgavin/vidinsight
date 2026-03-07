"""Service layer for YouTube video analysis – multi-phase pipeline."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from time import perf_counter

from app.core.config import Settings
from app.core.errors import AppError
from app.integrations.youtube import (
    estimate_duration,
    extract_video_id,
    fetch_transcript,
    fetch_video_info,
    format_transcript_for_llm,
    format_transcript_with_timestamps,
)
from app.lib.ai_processing import generate_topics_from_transcript
from app.prompts.video import (
    build_chat_system_prompt,
    build_explore_theme_prompt,
    build_suggested_questions_prompt,
    build_summary_prompt,
    parse_explore_response,
    parse_questions_response,
    parse_summary_response,
)
from app.providers import TextProviderRegistry
from app.providers.base import BaseTextProvider
from app.repositories.conversation_message import ConversationMessageRepository
from app.repositories.video_metadata import VideoMetadataRepository
from app.schemas import (
    ConversationKind,
    MessageContentType,
    TextModelType,
    VideoAnalyzeRequest,
    VideoCheckCacheRequest,
    VideoChatRequest,
    VideoConversationCreate,
    VideoExploreThemeRequest,
)

logger = logging.getLogger(__name__)
_GENERIC_UPSTREAM_ERROR_MESSAGE = "Upstream service unavailable. Please try again later."


def _error_event(code: str, message: str) -> dict:
    return {
        "type": "error",
        "error": {"code": code, "message": message},
    }


class VideoService:
    def __init__(
        self,
        conversation_repository: ConversationMessageRepository,
        video_metadata_repository: VideoMetadataRepository,
        providers: TextProviderRegistry,
        settings: Settings,
        *,
        chunk_size: int = 20,
    ) -> None:
        self.conversation_repository = conversation_repository
        self.video_metadata_repository = video_metadata_repository
        self.providers = providers
        self.settings = settings
        self.chunk_size = chunk_size

    # ------------------------------------------------------------------
    # Provider helpers
    # ------------------------------------------------------------------

    def _resolve_text_model(self, model_value: str) -> TextModelType:
        try:
            return TextModelType(model_value)
        except ValueError as exc:
            raise AppError(
                "unsupported_model",
                f"Unsupported model: {model_value}",
                status_code=422,
            ) from exc

    def _provider_for_model(self, model: TextModelType) -> BaseTextProvider:
        return self.providers.get(model)

    async def _generate_with_model(self, model: TextModelType, messages: list[dict]) -> str:
        return await self._provider_for_model(model).generate(messages)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def list_models(self) -> list[dict]:
        return self.providers.list_models()

    async def list_conversations(self) -> list[dict]:
        return await self.conversation_repository.list_conversations(
            kind=ConversationKind.video.value
        )

    async def create_conversation(self, req: VideoConversationCreate) -> dict:
        return await self.conversation_repository.create_conversation(
            req.title,
            req.model.value,
            kind=ConversationKind.video.value,
        )

    async def get_conversation(self, conversation_id: str) -> dict:
        conv = await self.conversation_repository.get_conversation(conversation_id)
        if conv is None or conv.get("kind") != ConversationKind.video.value:
            raise AppError(
                "conversation_not_found",
                "Conversation not found",
                status_code=404,
            )
        meta = await self.video_metadata_repository.get_video_metadata(conversation_id)
        if meta:
            conv["video_metadata"] = meta
        return conv

    async def delete_conversation(self, conversation_id: str) -> dict:
        deleted = await self.conversation_repository.delete_conversation(conversation_id)
        if not deleted:
            raise AppError(
                "conversation_not_found",
                "Conversation not found",
                status_code=404,
            )
        return {"ok": True}

    # ------------------------------------------------------------------
    # Cache check
    # ------------------------------------------------------------------

    async def check_cache(self, req: VideoCheckCacheRequest) -> dict:
        """Check if a video analysis is already cached. Returns cached data or None."""
        video_id = extract_video_id(req.url)
        meta = await self.video_metadata_repository.get_by_video_id_and_model(
            video_id, req.text_model.value,
        )
        if meta and meta.get("analysis_data"):
            try:
                analysis = json.loads(meta["analysis_data"])
                return {
                    "cached": True,
                    "video_id": video_id,
                    "conversation_id": meta["conversation_id"],
                    "analysis": analysis,
                    "video_info": {
                        "video_id": meta["video_id"],
                        "title": meta.get("video_title", ""),
                        "author": meta.get("video_author", ""),
                        "thumbnail_url": meta.get("video_thumbnail_url", ""),
                        "duration": meta.get("video_duration_seconds", 0),
                    },
                    "transcript": json.loads(meta.get("transcript", "[]")),
                }
            except json.JSONDecodeError:
                logger.warning("Corrupt analysis_data for video_id=%s", video_id)
        return {"cached": False, "video_id": video_id}

    # ------------------------------------------------------------------
    # Multi-phase analysis pipeline (SSE)
    # ------------------------------------------------------------------

    async def stream_analyze(self, req: VideoAnalyzeRequest) -> AsyncIterator[dict]:
        conversation_id = req.conversation_id.strip() or None
        conversation_ready = False
        model = req.text_model

        try:
            # Phase 1: init – validate URL, extract video_id
            yield {"type": "status", "text": "init"}
            video_id = extract_video_id(req.url)

            if conversation_id:
                conv = await self.conversation_repository.get_conversation(conversation_id)
                if conv is None:
                    raise AppError("conversation_not_found", "Conversation not found", status_code=404)
                if conv.get("kind") != ConversationKind.video.value:
                    raise AppError("conversation_kind_mismatch", "Conversation kind mismatch", status_code=422)
                model = self._resolve_text_model(str(conv.get("model") or ""))
                conversation_ready = True

            # Phase 2: cache – check for existing analysis
            yield {"type": "status", "text": "cache"}
            cached_meta = await self.video_metadata_repository.get_by_video_id_and_model(
                video_id, model.value,
            )
            if cached_meta and cached_meta.get("analysis_data"):
                try:
                    analysis = json.loads(cached_meta["analysis_data"])
                    yield {
                        "type": "cached",
                        "conversation_id": cached_meta["conversation_id"],
                        "video_info": {
                            "video_id": cached_meta["video_id"],
                            "title": cached_meta.get("video_title", ""),
                            "author": cached_meta.get("video_author", ""),
                            "thumbnail_url": cached_meta.get("video_thumbnail_url", ""),
                            "duration": cached_meta.get("video_duration_seconds", 0),
                        },
                        "transcript": json.loads(cached_meta.get("transcript", "[]")),
                        "analysis": analysis,
                    }
                    return
                except json.JSONDecodeError:
                    pass

            # Phase 3: fetching – parallel fetch metadata + transcript
            yield {"type": "status", "text": "fetching"}
            video_info = await fetch_video_info(video_id, self.settings)
            entries, language = await fetch_transcript(video_id, self.settings)
            duration = video_info.get("duration") or estimate_duration(entries)

            yield {"type": "video_info", "video_info": video_info}
            yield {"type": "transcript", "transcript": entries}

            # Phase 4: analysis_start – create conversation, save metadata
            if not conversation_id:
                title = (video_info.get("title") or "")[:50] or f"Video: {video_id}"
                conv = await self.conversation_repository.create_conversation(
                    title=title,
                    model=model.value,
                    kind=ConversationKind.video.value,
                )
                conversation_id = conv["id"]
                conversation_ready = True
            else:
                title = (video_info.get("title") or "")[:50]
                if title:
                    await self.conversation_repository.update_title(conversation_id, title)

            transcript_json = json.dumps(entries, ensure_ascii=False)
            await self.video_metadata_repository.save_video_metadata(
                conversation_id,
                video_id=video_id,
                video_title=video_info.get("title", ""),
                video_author=video_info.get("author", ""),
                video_duration_seconds=duration,
                video_thumbnail_url=video_info.get("thumbnail_url", ""),
                transcript=transcript_json,
                language=language,
            )

            yield {
                "type": "analysis_start",
                "conversation_id": conversation_id,
                "title": video_info.get("title", ""),
            }

            # Save user message
            await self.conversation_repository.append_message(
                conversation_id,
                "user",
                req.url,
                content_type=MessageContentType.text.value,
            )

            # Phase 5: generating – chunked topic generation
            yield {"type": "status", "text": "generating"}
            provider = self._provider_for_model(model)

            logger.info(
                "topic_generation_start conversation_id=%s video_id=%s model=%s segments=%d",
                conversation_id, video_id, model.value, len(entries),
            )
            start = perf_counter()
            topic_result = await generate_topics_from_transcript(
                entries, provider, provider, video_info, max_topics=5,
            )
            dur_ms = (perf_counter() - start) * 1000
            logger.info(
                "topic_generation_end conversation_id=%s model=%s topics=%d duration_ms=%.2f",
                conversation_id, model.value, len(topic_result.topics), dur_ms,
            )

            yield {"type": "topics", "topics": topic_result.topics}

            # Phase 6: processing – parallel summary + questions
            yield {"type": "status", "text": "processing"}
            transcript_text = format_transcript_with_timestamps(entries)

            summary_prompt = build_summary_prompt(transcript_text, video_info)
            questions_prompt = build_suggested_questions_prompt(
                transcript_text, video_info, topic_result.topics,
            )

            async def _gen_summary() -> list[dict]:
                resp = await self._generate_with_model(
                    model,
                    [{"role": "user", "content": summary_prompt}]
                )
                return parse_summary_response(resp)

            async def _gen_questions() -> list[str]:
                resp = await self._generate_with_model(
                    model,
                    [{"role": "user", "content": questions_prompt}]
                )
                return parse_questions_response(resp)

            summary_result, questions_result = await asyncio.gather(
                _gen_summary(), _gen_questions(), return_exceptions=True
            )
            if isinstance(summary_result, BaseException):
                logger.warning("Summary generation failed: %s", summary_result)
                summary_result = []
            if isinstance(questions_result, BaseException):
                logger.warning("Questions generation failed: %s", questions_result)
                questions_result = []

            analysis = {
                "topics": topic_result.topics,
                "takeaways": summary_result,
                "questions": questions_result,
                "themes": [],
            }

            # Save analysis to DB
            analysis_json = json.dumps(analysis, ensure_ascii=False)
            await self.video_metadata_repository.update_analysis_data(
                conversation_id, analysis_json,
            )
            await self.conversation_repository.append_message(
                conversation_id,
                "assistant",
                analysis_json,
                content_type=MessageContentType.video_analysis.value,
            )

            yield {
                "type": "analysis",
                "analysis": analysis,
                "conversation_id": conversation_id,
            }
            yield {"type": "done", "conversation_id": conversation_id}

        except AppError as exc:
            if conversation_ready and conversation_id is not None:
                await self.conversation_repository.append_message(
                    conversation_id, "assistant", exc.message,
                    content_type=MessageContentType.error.value,
                )
            yield _error_event(exc.code, exc.message)
        except Exception as exc:
            logger.exception("Video analysis error", exc_info=exc)
            if conversation_ready and conversation_id is not None:
                await self.conversation_repository.append_message(
                    conversation_id, "assistant", _GENERIC_UPSTREAM_ERROR_MESSAGE,
                    content_type=MessageContentType.error.value,
                )
            yield _error_event("upstream_error", _GENERIC_UPSTREAM_ERROR_MESSAGE)

    # ------------------------------------------------------------------
    # Chat (hardcoded qwen → deepseek fallback)
    # ------------------------------------------------------------------

    async def stream_chat(self, req: VideoChatRequest) -> AsyncIterator[dict]:
        user_message_saved = False
        try:
            conversation = await self.conversation_repository.get_conversation(req.conversation_id)
            if conversation is None:
                raise AppError("conversation_not_found", "Conversation not found", status_code=404)
            if conversation.get("kind") != ConversationKind.video.value:
                raise AppError("conversation_kind_mismatch", "Conversation kind mismatch", status_code=422)

            meta = await self.video_metadata_repository.get_video_metadata(req.conversation_id)
            if not meta:
                raise AppError("video_metadata_missing", "Video metadata not found", status_code=422)

            await self.conversation_repository.append_message(
                req.conversation_id, "user", req.message,
                content_type=MessageContentType.text.value,
            )
            user_message_saved = True

            yield {"type": "status", "text": "Thinking..."}

            transcript_entries = json.loads(meta.get("transcript", "[]"))
            transcript_text = format_transcript_for_llm(transcript_entries)
            system_prompt = build_chat_system_prompt(
                title=meta.get("video_title", ""),
                author=meta.get("video_author", ""),
                transcript=transcript_text,
            )

            provider_messages: list[dict] = [{"role": "system", "content": system_prompt}]
            for item in conversation["messages"]:
                if item.get("content_type", "text") == "text":
                    provider_messages.append({"role": item["role"], "content": item["content"]})
            provider_messages.append({"role": "user", "content": req.message})

            model = self._resolve_text_model(str(conversation.get("model") or ""))

            logger.info(
                "model_call_start service=video_chat conversation_id=%s model=%s input_messages=%s",
                req.conversation_id, model.value, len(provider_messages),
            )
            start = perf_counter()
            full_response = await self._generate_with_model(model, provider_messages)
            dur_ms = (perf_counter() - start) * 1000
            logger.info(
                "model_call_end service=video_chat conversation_id=%s model=%s duration_ms=%.2f",
                req.conversation_id, model.value, dur_ms,
            )

            for index in range(0, len(full_response), self.chunk_size):
                chunk = full_response[index : index + self.chunk_size]
                yield {"type": "text", "text": chunk}

            await self.conversation_repository.append_message(
                req.conversation_id, "assistant", full_response,
                content_type=MessageContentType.text.value,
            )
            yield {"type": "done"}

        except AppError as exc:
            if user_message_saved:
                await self.conversation_repository.append_message(
                    req.conversation_id, "assistant", exc.message,
                    content_type=MessageContentType.error.value,
                )
            yield _error_event(exc.code, exc.message)
        except Exception as exc:
            logger.exception("Video chat error", exc_info=exc)
            if user_message_saved:
                await self.conversation_repository.append_message(
                    req.conversation_id, "assistant", _GENERIC_UPSTREAM_ERROR_MESSAGE,
                    content_type=MessageContentType.error.value,
                )
            yield _error_event("upstream_error", _GENERIC_UPSTREAM_ERROR_MESSAGE)

    # ------------------------------------------------------------------
    # Explore theme (hardcoded qwen → deepseek fallback)
    # ------------------------------------------------------------------

    async def stream_explore_theme(self, req: VideoExploreThemeRequest) -> AsyncIterator[dict]:
        try:
            conversation = await self.conversation_repository.get_conversation(req.conversation_id)
            if conversation is None:
                raise AppError("conversation_not_found", "Conversation not found", status_code=404)
            if conversation.get("kind") != ConversationKind.video.value:
                raise AppError("conversation_kind_mismatch", "Conversation kind mismatch", status_code=422)

            meta = await self.video_metadata_repository.get_video_metadata(req.conversation_id)
            if not meta:
                raise AppError("video_metadata_missing", "Video metadata not found", status_code=422)

            yield {"type": "status", "text": f"Exploring theme: {req.theme}..."}

            transcript_entries = json.loads(meta.get("transcript", "[]"))
            transcript_text = format_transcript_for_llm(transcript_entries)
            model = self._resolve_text_model(str(conversation.get("model") or ""))
            explore_prompt = build_explore_theme_prompt(
                title=meta.get("video_title", ""),
                author=meta.get("video_author", ""),
                transcript=transcript_text,
                theme=req.theme,
            )

            logger.info(
                "model_call_start service=video_explore conversation_id=%s model=%s theme=%r",
                req.conversation_id, model.value, req.theme,
            )
            start = perf_counter()
            full_response = await self._generate_with_model(
                model,
                [{"role": "user", "content": explore_prompt}],
            )
            dur_ms = (perf_counter() - start) * 1000
            logger.info(
                "model_call_end service=video_explore conversation_id=%s model=%s duration_ms=%.2f",
                req.conversation_id, model.value, dur_ms,
            )

            for index in range(0, len(full_response), self.chunk_size):
                chunk = full_response[index : index + self.chunk_size]
                yield {"type": "text", "text": chunk}

            exploration = parse_explore_response(full_response)
            yield {"type": "exploration", "exploration": exploration}
            yield {"type": "done"}

        except AppError as exc:
            yield _error_event(exc.code, exc.message)
        except Exception as exc:
            logger.exception("Video explore error", exc_info=exc)
            yield _error_event("upstream_error", _GENERIC_UPSTREAM_ERROR_MESSAGE)

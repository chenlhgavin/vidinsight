"""Service for LLM-based batch text translation."""

from __future__ import annotations

import asyncio
import logging

from app.core.config import Settings
from app.prompts.translation import build_translation_prompt, parse_translation_response
from app.providers import TextProviderRegistry
from app.providers.base import BaseTextProvider
from app.schemas.shared import TextModelType

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 35
_MAX_CONCURRENT = 6


class TranslationService:
    def __init__(
        self,
        providers: TextProviderRegistry,
        settings: Settings,
    ) -> None:
        self.providers = providers
        self.settings = settings
        self._semaphore = asyncio.Semaphore(_MAX_CONCURRENT)

    def _get_primary_provider(self) -> BaseTextProvider:
        return self.providers.get(TextModelType.qwen)

    def _get_fallback_provider(self) -> BaseTextProvider:
        return self.providers.get(TextModelType.deepseek)

    async def _generate_with_fallback(self, messages: list[dict]) -> str:
        """Try qwen provider; on failure retry with deepseek."""
        try:
            return await self._get_primary_provider().generate(messages)
        except Exception as exc:
            logger.warning("Primary provider (qwen) failed (%s), using deepseek", exc)
            return await self._get_fallback_provider().generate(messages)

    async def _translate_chunk(
        self,
        texts: list[str],
        target_language: str,
        context: str,
    ) -> list[str]:
        """Translate a single chunk of texts. Returns original texts on failure."""
        async with self._semaphore:
            try:
                messages = build_translation_prompt(texts, target_language, context)
                response = await self._generate_with_fallback(messages)
                return parse_translation_response(response, len(texts))
            except Exception as exc:
                logger.error("Translation chunk failed: %s", exc)
                return list(texts)

    async def translate_batch(
        self,
        texts: list[str],
        target_language: str,
        context: str = "",
    ) -> list[str]:
        """Translate a batch of texts, chunking into groups of 35."""
        if not texts:
            return []

        chunks: list[list[str]] = []
        for i in range(0, len(texts), _CHUNK_SIZE):
            chunks.append(texts[i : i + _CHUNK_SIZE])

        results = await asyncio.gather(
            *(self._translate_chunk(chunk, target_language, context) for chunk in chunks)
        )

        translations: list[str] = []
        for chunk_result in results:
            translations.extend(chunk_result)

        return translations

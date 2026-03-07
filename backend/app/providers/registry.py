from __future__ import annotations

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas import TextModelType

from .base import BaseTextProvider
from .text.claude import ClaudeOpusProvider, ClaudeSonnetProvider
from .text.deepseek import DeepSeekProvider
from .text.qwen import QwenProvider


class TextProviderRegistry:
    def __init__(self, providers: dict[TextModelType, BaseTextProvider]) -> None:
        self.providers = providers

    def list_models(self) -> list[dict]:
        return [
            {
                "id": provider.descriptor.id,
                "name": provider.descriptor.name,
                "description": provider.descriptor.description,
            }
            for provider in self.providers.values()
        ]

    def get(self, model: TextModelType) -> BaseTextProvider:
        provider = self.providers.get(model)
        if provider is None:
            raise AppError(
                "unsupported_model",
                f"Unsupported model: {model}",
                status_code=422,
            )
        return provider

    async def close(self) -> None:
        for provider in self.providers.values():
            await provider.close()


def build_default_text_provider_registry(settings: Settings) -> TextProviderRegistry:
    return TextProviderRegistry(
        {
            TextModelType.claude_sonnet: ClaudeSonnetProvider(settings),
            TextModelType.claude_opus: ClaudeOpusProvider(settings),
            TextModelType.qwen: QwenProvider(settings),
            TextModelType.deepseek: DeepSeekProvider(settings),
        }
    )

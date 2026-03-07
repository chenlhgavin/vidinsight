from __future__ import annotations

import httpx

from app.core.config import Settings
from app.schemas import TextModelType
from app.providers.base import BaseTextProvider, ModelDescriptor
from app.providers.retry import _request_with_retries


class DeepSeekProvider(BaseTextProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.descriptor = ModelDescriptor(
            id=TextModelType.deepseek,
            name="DeepSeek",
            description=settings.deepseek_model,
        )
        self.client = httpx.AsyncClient(timeout=180.0)

    async def generate(self, messages: list[dict]) -> str:
        trimmed = messages[-self.settings.max_context_messages :]
        url = f"{self.settings.deepseek_base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": self.settings.deepseek_model,
            "max_tokens": 8192,
            "messages": trimmed,
        }
        headers = {
            "content-type": "application/json",
            "authorization": f"Bearer {self.settings.deepseek_api_key}",
        }
        data = await _request_with_retries(
            client=self.client,
            url=url,
            payload=payload,
            headers=headers,
            max_retries=self.settings.max_retries,
            retry_delays=self.settings.retry_delays,
            label="DeepSeek",
        )
        return data["choices"][0]["message"]["content"]

    async def close(self) -> None:
        await self.client.aclose()

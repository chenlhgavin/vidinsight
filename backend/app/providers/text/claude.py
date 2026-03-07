from __future__ import annotations

import httpx

from app.core.config import Settings
from app.schemas import TextModelType
from app.providers.base import BaseTextProvider, ModelDescriptor
from app.providers.retry import _request_with_retries


class _ClaudeBaseProvider(BaseTextProvider):
    model_label: str

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = httpx.AsyncClient(timeout=180.0)

    def _build_headers(self) -> dict:
        headers = {
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        if self.settings.anthropic_auth_token:
            headers["authorization"] = f"Bearer {self.settings.anthropic_auth_token}"
        elif self.settings.anthropic_api_key:
            headers["x-api-key"] = self.settings.anthropic_api_key
        return headers

    async def _generate_with_model(self, messages: list[dict], model_name: str) -> str:
        trimmed = messages[-self.settings.max_context_messages :]
        system_parts = [m["content"] for m in trimmed if m.get("role") == "system"]
        non_system = [m for m in trimmed if m.get("role") != "system"]
        url = f"{self.settings.anthropic_base_url.rstrip('/')}/v1/messages"
        payload = {
            "model": model_name,
            "max_tokens": 16384,
            "messages": non_system,
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        data = await _request_with_retries(
            client=self.client,
            url=url,
            payload=payload,
            headers=self._build_headers(),
            max_retries=self.settings.max_retries,
            retry_delays=self.settings.retry_delays,
            label=self.model_label,
        )
        return data["content"][0]["text"]

    async def close(self) -> None:
        await self.client.aclose()


class ClaudeSonnetProvider(_ClaudeBaseProvider):
    model_label = "Claude Sonnet"

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.descriptor = ModelDescriptor(
            id=TextModelType.claude_sonnet,
            name="Claude Sonnet",
            description=settings.claude_sonnet_model,
        )

    async def generate(self, messages: list[dict]) -> str:
        return await self._generate_with_model(messages, self.settings.claude_sonnet_model)


class ClaudeOpusProvider(_ClaudeBaseProvider):
    model_label = "Claude Opus"

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.descriptor = ModelDescriptor(
            id=TextModelType.claude_opus,
            name="Claude Opus",
            description=settings.claude_opus_model,
        )

    async def generate(self, messages: list[dict]) -> str:
        return await self._generate_with_model(messages, self.settings.claude_opus_model)

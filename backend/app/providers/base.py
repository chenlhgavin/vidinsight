from __future__ import annotations

from dataclasses import dataclass

from app.schemas import ImageModelType, TextModelType


@dataclass(slots=True)
class ModelDescriptor:
    id: TextModelType
    name: str
    description: str


@dataclass(slots=True)
class ImageModelDescriptor:
    id: ImageModelType
    name: str
    description: str


@dataclass(slots=True)
class ImageGenerationResult:
    text: str
    images: list[dict]


class BaseTextProvider:
    descriptor: ModelDescriptor

    async def generate(self, messages: list[dict]) -> str:
        raise NotImplementedError

    async def close(self) -> None:
        raise NotImplementedError


class BaseImageProvider:
    descriptor: ImageModelDescriptor

    async def generate(self, messages: list[dict], style_image: bytes | None = None) -> ImageGenerationResult:
        raise NotImplementedError

    async def close(self) -> None:
        return None

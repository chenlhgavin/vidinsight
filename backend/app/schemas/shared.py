from enum import Enum
from typing import Any, TypeAlias

from pydantic import BaseModel, Field, field_validator

# Readability aliases: all remain plain str at runtime and preserve API contract.
ConversationIDStr: TypeAlias = str
ModelIDStr: TypeAlias = str
ISODateTimeStr: TypeAlias = str
SerializedTranscriptJsonStr: TypeAlias = str

EMPTY_CONVERSATION_ID = ""
EMPTY_TRANSCRIPT_JSON = "[]"


class TextModelType(str, Enum):
    claude_sonnet = "claude-sonnet"
    claude_opus = "claude-opus"
    qwen = "qwen"
    deepseek = "deepseek"


class ImageModelType(str, Enum):
    gemini_image = "gemini-image"
    nano_banana = "nano-banana"
    doubao_seedream = "doubao-seedream"
    doubao_seedream_v45 = "doubao-seedream-v45"


class ConversationKind(str, Enum):
    text = "text"
    image = "image"
    slide = "slide"
    video = "video"


class MessageContentType(str, Enum):
    text = "text"
    image_result = "image_result"
    error = "error"
    video_info = "video_info"
    video_analysis = "video_analysis"


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class TextModelInfo(BaseModel):
    id: TextModelType
    name: str
    description: str


class ImageModelInfo(BaseModel):
    id: ImageModelType
    name: str
    description: str


class ImageAsset(BaseModel):
    id: str
    mime_type: str
    width: int | None = None
    height: int | None = None
    url: str = ""


class MessageRecord(BaseModel):
    id: str
    role: str = Field(description="Message sender role, usually user/assistant/system.")
    content: str
    created_at: ISODateTimeStr
    content_type: MessageContentType = MessageContentType.text
    slide_index: int | None = None
    images: list[ImageAsset] = Field(default_factory=list)


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: ISODateTimeStr
    message_count: int
    model: ModelIDStr = Field(description="Conversation model identifier.")
    kind: ConversationKind = ConversationKind.text


class StyleCandidateInfo(BaseModel):
    id: str
    url: str


class ConversationDetail(BaseModel):
    id: str
    title: str
    created_at: ISODateTimeStr
    message_count: int
    model: ModelIDStr = Field(description="Conversation model identifier.")
    kind: ConversationKind = ConversationKind.text
    image_model: str | None = None
    messages: list[MessageRecord]
    style_name: str | None = None
    style_candidate_id: str | None = None
    style_candidates: list[StyleCandidateInfo] = Field(default_factory=list)

    @field_validator("style_candidates", mode="before")
    @classmethod
    def coerce_style_candidates(cls, v: object) -> list:
        if v is None:
            return []
        return v


class DeleteResponse(BaseModel):
    ok: bool

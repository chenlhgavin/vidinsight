from enum import Enum

from pydantic import BaseModel, Field

from .shared import (
    ConversationDetail,
    ConversationIDStr,
    EMPTY_CONVERSATION_ID,
    EMPTY_TRANSCRIPT_JSON,
    ISODateTimeStr,
    SerializedTranscriptJsonStr,
    TextModelType,
)


class VideoMetadata(BaseModel):
    id: str
    conversation_id: ConversationIDStr
    video_id: str
    video_title: str = ""
    video_author: str = ""
    video_duration_seconds: int = 0
    video_thumbnail_url: str = ""
    transcript: SerializedTranscriptJsonStr = Field(
        default=EMPTY_TRANSCRIPT_JSON,
        description="JSON-serialized transcript entries list.",
    )
    language: str = ""
    created_at: ISODateTimeStr


class VideoConversationDetail(ConversationDetail):
    video_metadata: VideoMetadata | None = None


class VideoConversationCreate(BaseModel):
    title: str = ""
    model: TextModelType = TextModelType.claude_sonnet


class VideoCheckCacheRequest(BaseModel):
    url: str = Field(min_length=1)
    text_model: TextModelType = Field(
        default=TextModelType.qwen,
        description="Model used when checking for cached video analysis.",
    )


class VideoAnalyzeRequest(BaseModel):
    url: str = Field(min_length=1)
    conversation_id: ConversationIDStr = Field(
        default=EMPTY_CONVERSATION_ID,
        description="Optional existing video conversation ID. Empty string means create a new one.",
    )
    text_model: TextModelType = Field(
        default=TextModelType.qwen,
        description="Model used for video analysis when creating a new conversation.",
    )


class VideoChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str


class VideoExploreThemeRequest(BaseModel):
    theme: str = Field(min_length=1)
    conversation_id: str


class VideoTranslateRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=500)
    target_language: str = Field(min_length=2, max_length=10)
    context: str = ""


class VideoTranslateResponse(BaseModel):
    translations: list[str]


class VideoNoteSource(str, Enum):
    transcript = "transcript"
    chat = "chat"
    summary = "summary"
    custom = "custom"


class VideoNoteCreate(BaseModel):
    conversation_id: str = Field(min_length=1)
    source: VideoNoteSource
    text: str = Field(min_length=1)
    source_id: str | None = None
    metadata: str | None = None


class VideoNoteResponse(BaseModel):
    id: str
    conversation_id: str
    source: VideoNoteSource
    source_id: str | None = None
    text: str
    metadata: str | None = None
    created_at: ISODateTimeStr
    updated_at: ISODateTimeStr

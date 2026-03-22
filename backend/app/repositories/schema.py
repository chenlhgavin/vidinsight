from __future__ import annotations

from sqlalchemy import (
    Column,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.mysql import LONGTEXT

metadata = MetaData()

conversations = Table(
    "conversations",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("title", String(255), nullable=False),
    Column("model", String(128), nullable=False),
    Column("kind", String(32), nullable=False, server_default="text"),
    Column("created_at", String(64), nullable=False),
    Column("updated_at", String(64), nullable=False),
    Column("image_model", String(128), nullable=True),
    Column("style_name", String(128), nullable=True),
    Column("style_candidate_id", String(255), nullable=True),
    Column("style_candidates", Text, nullable=True),
    Column("style_candidate_seen", Text, nullable=True),
    Index("idx_conversations_kind_created_at", "kind", "created_at"),
)

messages = Table(
    "messages",
    metadata,
    Column("id", String(36), primary_key=True),
    Column(
        "conversation_id",
        String(36),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("role", String(32), nullable=False),
    Column("content", Text, nullable=False),
    Column("content_type", String(32), nullable=False, server_default="text"),
    Column("slide_index", Integer, nullable=True),
    Column("created_at", String(64), nullable=False),
    Column("position", Integer, nullable=False),
    UniqueConstraint(
        "conversation_id",
        "position",
        name="idx_messages_conversation_position",
    ),
    Index("idx_messages_conversation_id", "conversation_id"),
    Index("idx_messages_conversation_slide_index", "conversation_id", "slide_index"),
)

message_images = Table(
    "message_images",
    metadata,
    Column("id", String(36), primary_key=True),
    Column(
        "message_id",
        String(36),
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("file_path", Text, nullable=False),
    Column("mime_type", String(64), nullable=False),
    Column("width", Integer, nullable=True),
    Column("height", Integer, nullable=True),
    Column("webp_key", String(255), nullable=True),
    Column("thumb_sm_key", String(255), nullable=True),
    Column("thumb_md_key", String(255), nullable=True),
    Column("lqip", Text, nullable=True),
    Column("created_at", String(64), nullable=False),
)

video_metadata = Table(
    "video_metadata",
    metadata,
    Column("id", String(36), primary_key=True),
    Column(
        "conversation_id",
        String(36),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    ),
    Column("video_id", String(64), nullable=False),
    Column("video_title", Text, nullable=False),
    Column("video_author", Text, nullable=False),
    Column("video_duration_seconds", Integer, nullable=False, server_default="0"),
    Column("video_thumbnail_url", Text, nullable=False),
    Column("transcript", Text().with_variant(LONGTEXT, "mysql"), nullable=False),
    Column("language", String(32), nullable=False, server_default=""),
    Column("analysis_data", Text, nullable=True),
    Column("created_at", String(64), nullable=False),
)

video_notes = Table(
    "video_notes",
    metadata,
    Column("id", String(36), primary_key=True),
    Column(
        "conversation_id",
        String(36),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("source", String(32), nullable=False),
    Column("source_id", String(36), nullable=True),
    Column("text", Text, nullable=False),
    Column("metadata", Text, nullable=True),
    Column("created_at", String(64), nullable=False),
    Column("updated_at", String(64), nullable=False),
    Index("idx_video_notes_conversation_id", "conversation_id"),
)

users = Table(
    "users",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("username", String(128), nullable=False),
    Column("password_hash", String(255), nullable=False),
    Column("is_active", Integer, nullable=False, server_default="1"),
    Column("created_at", String(64), nullable=False),
    Column("updated_at", String(64), nullable=False),
    UniqueConstraint("username", name="uq_users_username"),
)

slide_style_candidates = Table(
    "slide_style_candidates",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("image_model", String(128), nullable=False),
    Column("style_name", String(128), nullable=False),
    Column("storage_key", String(255), nullable=False),
    Column("created_at", String(64), nullable=False),
    UniqueConstraint("storage_key", name="uq_slide_style_candidates_storage_key"),
    Index(
        "idx_slide_style_candidates_model_style_created_at",
        "image_model",
        "style_name",
        "created_at",
    ),
)

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import desc, insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from .schema import conversations, metadata as repository_metadata, video_metadata


class VideoMetadataRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def initialize(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(repository_metadata.create_all)

    async def save_video_metadata(
        self,
        conversation_id: str,
        *,
        video_id: str,
        video_title: str = "",
        video_author: str = "",
        video_duration_seconds: int = 0,
        video_thumbnail_url: str = "",
        transcript: str = "[]",
        language: str = "",
    ) -> dict:
        now = datetime.now(timezone.utc).isoformat()

        async with self.engine.begin() as conn:
            existing = (
                await conn.execute(
                    select(video_metadata.c.id).where(
                        video_metadata.c.conversation_id == conversation_id
                    )
                )
            ).first()

            if existing is None:
                meta_id = str(uuid.uuid4())
                await conn.execute(
                    insert(video_metadata).values(
                        id=meta_id,
                        conversation_id=conversation_id,
                        video_id=video_id,
                        video_title=video_title,
                        video_author=video_author,
                        video_duration_seconds=video_duration_seconds,
                        video_thumbnail_url=video_thumbnail_url,
                        transcript=transcript,
                        language=language,
                        created_at=now,
                    )
                )
            else:
                meta_id = str(existing[0])
                await conn.execute(
                    update(video_metadata)
                    .where(video_metadata.c.conversation_id == conversation_id)
                    .values(
                        video_id=video_id,
                        video_title=video_title,
                        video_author=video_author,
                        video_duration_seconds=video_duration_seconds,
                        video_thumbnail_url=video_thumbnail_url,
                        transcript=transcript,
                        language=language,
                        created_at=now,
                    )
                )

        return {
            "id": meta_id,
            "conversation_id": conversation_id,
            "video_id": video_id,
            "video_title": video_title,
            "video_author": video_author,
            "video_duration_seconds": video_duration_seconds,
            "video_thumbnail_url": video_thumbnail_url,
            "transcript": transcript,
            "language": language,
            "created_at": now,
        }

    async def get_video_metadata(self, conversation_id: str) -> dict | None:
        stmt = select(video_metadata).where(video_metadata.c.conversation_id == conversation_id)

        async with self.engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().first()

        if row is None:
            return None
        return dict(row)

    async def get_by_video_id(self, video_id: str) -> dict | None:
        """Look up metadata by YouTube video_id (for cache checks)."""
        stmt = select(video_metadata).where(video_metadata.c.video_id == video_id)

        async with self.engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().first()

        if row is None:
            return None
        return dict(row)

    async def get_by_video_id_and_model(self, video_id: str, model: str) -> dict | None:
        """Look up metadata by YouTube video_id and conversation model."""
        stmt = (
            select(video_metadata)
            .join(conversations, conversations.c.id == video_metadata.c.conversation_id)
            .where(video_metadata.c.video_id == video_id)
            .where(conversations.c.model == model)
            .where(conversations.c.kind == "video")
            .order_by(desc(video_metadata.c.created_at))
        )

        async with self.engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().first()

        if row is None:
            return None
        return dict(row)

    async def update_analysis_data(self, conversation_id: str, analysis_data: str) -> None:
        """Store cached analysis JSON on existing metadata row."""
        async with self.engine.begin() as conn:
            await conn.execute(
                update(video_metadata)
                .where(video_metadata.c.conversation_id == conversation_id)
                .values(analysis_data=analysis_data)
            )

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncEngine

from .schema import metadata as repository_metadata, video_notes


class VideoNoteRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def initialize(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(repository_metadata.create_all)

    async def list_by_conversation(self, conversation_id: str) -> list[dict]:
        stmt = (
            select(video_notes)
            .where(video_notes.c.conversation_id == conversation_id)
            .order_by(video_notes.c.created_at.desc())
        )
        async with self.engine.connect() as conn:
            rows = (await conn.execute(stmt)).mappings().all()
        return [dict(row) for row in rows]

    async def create(
        self,
        conversation_id: str,
        source: str,
        text: str,
        source_id: str | None = None,
        metadata: str | None = None,
    ) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        note_id = str(uuid.uuid4())
        values = {
            "id": note_id,
            "conversation_id": conversation_id,
            "source": source,
            "source_id": source_id,
            "text": text,
            "metadata": metadata,
            "created_at": now,
            "updated_at": now,
        }
        async with self.engine.begin() as conn:
            await conn.execute(insert(video_notes).values(**values))
        return values

    async def delete(self, note_id: str) -> bool:
        async with self.engine.begin() as conn:
            result = await conn.execute(
                delete(video_notes).where(video_notes.c.id == note_id)
            )
        return result.rowcount > 0

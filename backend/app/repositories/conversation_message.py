from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from .schema import conversations, messages, metadata as repository_metadata


class ConversationMessageRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def initialize(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(repository_metadata.create_all)

    async def list_conversations(self, kind: str | None = None) -> list[dict]:
        message_count_subq = (
            select(func.count(messages.c.id))
            .where(messages.c.conversation_id == conversations.c.id)
            .correlate(conversations)
            .scalar_subquery()
            .label("message_count")
        )
        stmt = (
            select(
                conversations.c.id,
                conversations.c.title,
                conversations.c.created_at,
                conversations.c.model,
                conversations.c.kind,
                message_count_subq,
            )
            .order_by(conversations.c.created_at.desc())
        )
        if kind:
            stmt = stmt.where(conversations.c.kind == kind)

        async with self.engine.connect() as conn:
            rows = (await conn.execute(stmt)).mappings().all()
        return [dict(row) for row in rows]

    async def list_conversations_by_kind(self, kind: str) -> list[dict]:
        return await self.list_conversations(kind=kind)

    async def create_conversation(self, title: str, model: str, kind: str = "text") -> dict:
        conv_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        resolved_title = title or "New Chat"

        async with self.engine.begin() as conn:
            await conn.execute(
                insert(conversations).values(
                    id=conv_id,
                    title=resolved_title,
                    model=model,
                    kind=kind,
                    created_at=now,
                    updated_at=now,
                )
            )

        return {
            "id": conv_id,
            "title": resolved_title,
            "created_at": now,
            "model": model,
            "kind": kind,
            "message_count": 0,
            "messages": [],
        }

    async def get_conversation(self, conversation_id: str) -> dict | None:
        conv_stmt = (
            select(
                conversations.c.id,
                conversations.c.title,
                conversations.c.created_at,
                conversations.c.model,
                func.coalesce(conversations.c.kind, "text").label("kind"),
                conversations.c.image_model,
                conversations.c.style_name,
                conversations.c.style_candidate_id,
                conversations.c.style_candidates,
                conversations.c.style_candidate_seen,
                func.count(messages.c.id).label("message_count"),
            )
            .select_from(
                conversations.outerjoin(
                    messages,
                    messages.c.conversation_id == conversations.c.id,
                )
            )
            .where(conversations.c.id == conversation_id)
            .group_by(
                conversations.c.id,
                conversations.c.title,
                conversations.c.created_at,
                conversations.c.model,
                conversations.c.kind,
                conversations.c.image_model,
                conversations.c.style_name,
                conversations.c.style_candidate_id,
                conversations.c.style_candidates,
                conversations.c.style_candidate_seen,
            )
        )

        async with self.engine.connect() as conn:
            row = (await conn.execute(conv_stmt)).mappings().first()
            if row is None:
                return None

            message_rows = (
                await conn.execute(
                    select(
                        messages.c.id,
                        messages.c.role,
                        messages.c.content,
                        messages.c.created_at,
                        func.coalesce(messages.c.content_type, "text").label("content_type"),
                        messages.c.slide_index,
                    )
                    .where(messages.c.conversation_id == conversation_id)
                    .order_by(messages.c.position.asc())
                )
            ).mappings().all()

        conversation = dict(row)
        conversation["messages"] = [
            {
                "id": msg["id"],
                "role": msg["role"],
                "content": msg["content"],
                "created_at": msg["created_at"],
                "content_type": msg["content_type"],
                "slide_index": msg["slide_index"],
                "images": [],
            }
            for msg in message_rows
        ]
        return conversation

    async def delete_conversation(self, conversation_id: str) -> bool:
        async with self.engine.begin() as conn:
            result = await conn.execute(
                delete(conversations).where(conversations.c.id == conversation_id)
            )
            return result.rowcount > 0

    async def append_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        *,
        content_type: str = "text",
        slide_index: int | None = None,
    ) -> dict:
        message_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        async with self.engine.begin() as conn:
            next_position = (
                await conn.execute(
                    select(func.coalesce(func.max(messages.c.position), -1) + 1).where(
                        messages.c.conversation_id == conversation_id
                    )
                )
            ).scalar_one()

            await conn.execute(
                insert(messages).values(
                    id=message_id,
                    conversation_id=conversation_id,
                    role=role,
                    content=content,
                    content_type=content_type,
                    slide_index=slide_index,
                    created_at=now,
                    position=int(next_position),
                )
            )
            await conn.execute(
                update(conversations)
                .where(conversations.c.id == conversation_id)
                .values(updated_at=now)
            )

        return {
            "id": message_id,
            "role": role,
            "content": content,
            "created_at": now,
            "content_type": content_type,
            "slide_index": slide_index,
            "images": [],
        }

    async def delete_message(self, message_id: str) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(delete(messages).where(messages.c.id == message_id))

    async def update_title(self, conversation_id: str, title: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with self.engine.begin() as conn:
            await conn.execute(
                update(conversations)
                .where(conversations.c.id == conversation_id)
                .values(title=title, updated_at=now)
            )

    async def update_style_info(
        self,
        conversation_id: str,
        *,
        image_model: str | None = None,
        style_name: str | None = None,
        style_candidate_id: str | None = None,
        style_candidates: str | None = None,
        style_candidate_seen: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        values: dict = {"updated_at": now}
        if image_model is not None:
            values["image_model"] = image_model
        if style_name is not None:
            values["style_name"] = style_name
        if style_candidate_id is not None:
            values["style_candidate_id"] = style_candidate_id
        if style_candidates is not None:
            values["style_candidates"] = style_candidates
        if style_candidate_seen is not None:
            values["style_candidate_seen"] = style_candidate_seen
        async with self.engine.begin() as conn:
            await conn.execute(
                update(conversations)
                .where(conversations.c.id == conversation_id)
                .values(**values)
            )

    async def delete_messages_by_content_type(
        self, conversation_id: str, content_type: str
    ) -> int:
        async with self.engine.begin() as conn:
            result = await conn.execute(
                delete(messages)
                .where(messages.c.conversation_id == conversation_id)
                .where(messages.c.content_type == content_type)
            )
            return result.rowcount

    async def update_message_content(self, message_id: str, content: str) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(
                update(messages)
                .where(messages.c.id == message_id)
                .values(content=content)
            )

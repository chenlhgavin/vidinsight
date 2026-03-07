from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from .schema import metadata as repository_metadata, users


class UserRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def initialize(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(repository_metadata.create_all)

    async def get_by_username(self, username: str) -> dict | None:
        stmt = select(users).where(users.c.username == username)
        async with self.engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().first()
        return dict(row) if row else None

    async def create_user(self, username: str, password_hash: str) -> dict:
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        values = {
            "id": user_id,
            "username": username,
            "password_hash": password_hash,
            "is_active": 1,
            "created_at": now,
            "updated_at": now,
        }
        async with self.engine.begin() as conn:
            await conn.execute(insert(users).values(values))
        return values

    async def count(self) -> int:
        stmt = select(func.count(users.c.id))
        async with self.engine.connect() as conn:
            result = await conn.execute(stmt)
            return result.scalar() or 0

    async def update_password(self, user_id: str, password_hash: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        stmt = (
            update(users)
            .where(users.c.id == user_id)
            .values(password_hash=password_hash, updated_at=now)
        )
        async with self.engine.begin() as conn:
            await conn.execute(stmt)

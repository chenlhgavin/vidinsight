from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi.responses import StreamingResponse

_KEEPALIVE_COMMENT = ": keepalive\n\n"
_KEEPALIVE_INTERVAL = 15.0  # seconds


def message_summary(text: str, limit: int = 100) -> tuple[int, str]:
    normalized = text.replace("\n", "\\n")
    preview = normalized[:limit]
    if len(normalized) > limit:
        preview += "..."
    return len(text), preview


async def _sse_keepalive(
    events: AsyncIterator[dict],
    interval: float = _KEEPALIVE_INTERVAL,
):
    """Wrap an SSE event iterator with periodic keepalive comments.

    Sends ``: keepalive`` comment lines every *interval* seconds when no real
    events are flowing.  This prevents upstream proxies (nginx, Vite dev) from
    closing the connection due to read-timeout during long model calls.
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def _producer() -> None:
        try:
            async for event in events:
                await queue.put(f"data: {json.dumps(event)}\n\n")
        finally:
            await queue.put(None)  # sentinel

    task = asyncio.create_task(_producer())
    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=interval)
                if item is None:
                    break
                yield item
            except asyncio.TimeoutError:
                yield _KEEPALIVE_COMMENT
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def sse_response(events: AsyncIterator[dict]) -> StreamingResponse:
    return StreamingResponse(
        _sse_keepalive(events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

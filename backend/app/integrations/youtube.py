"""YouTube video utilities: URL parsing, metadata fetching, transcript retrieval."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import TYPE_CHECKING

import httpx

from app.core.errors import AppError

if TYPE_CHECKING:
    from app.core.config import Settings

logger = logging.getLogger(__name__)

_YOUTUBE_PATTERNS = [
    re.compile(r"(?:https?://)?(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})"),
    re.compile(r"(?:https?://)?youtu\.be/([a-zA-Z0-9_-]{11})"),
    re.compile(r"(?:https?://)?(?:www\.)?youtube\.com/embed/([a-zA-Z0-9_-]{11})"),
    re.compile(r"(?:https?://)?(?:www\.)?youtube\.com/shorts/([a-zA-Z0-9_-]{11})"),
]


def extract_video_id(url: str) -> str:
    """Extract the 11-character YouTube video ID from a URL."""
    url = url.strip()
    for pattern in _YOUTUBE_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    raise AppError(
        "invalid_youtube_url",
        f"Could not extract video ID from URL: {url}",
        status_code=422,
    )


async def fetch_video_info(video_id: str, settings: Settings | None = None) -> dict:
    """Fetch video metadata via Supadata API.

    Returns dict with keys: video_id, title, author, thumbnail_url, duration,
    description, tags.
    """
    fallback = {
        "video_id": video_id,
        "title": f"YouTube Video ({video_id})",
        "author": "Unknown",
        "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        "duration": 0,
        "description": "",
        "tags": [],
    }

    api_key = settings.supadata_api_key if settings else ""
    if not api_key:
        logger.warning("Supadata API key not configured, returning fallback for %s", video_id)
        return fallback

    max_retries = 3
    async with httpx.AsyncClient(timeout=15.0) as client:
        for attempt in range(max_retries):
            try:
                resp = await client.get(
                    f"https://api.supadata.ai/v1/youtube/video?id={video_id}",
                    headers={"x-api-key": api_key},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    duration = data.get("duration", 0)
                    if not isinstance(duration, (int, float)):
                        duration = 0
                    return {
                        "video_id": video_id,
                        "title": data.get("title", "") or fallback["title"],
                        "author": (data.get("channel") or {}).get("name", "") or data.get("author", "") or "Unknown",
                        "thumbnail_url": data.get("thumbnail", "") or fallback["thumbnail_url"],
                        "duration": int(duration),
                        "description": data.get("description", ""),
                        "tags": data.get("tags") or [],
                    }
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("retry-after", 2 ** attempt))
                    logger.warning(
                        "Supadata video-info rate limited (429), retry %d/%d after %ds",
                        attempt + 1, max_retries, retry_after,
                    )
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_after)
                        continue
                logger.warning("Supadata video-info request failed: HTTP %s", resp.status_code)
                break
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                logger.warning("Supadata video-info fetch failed: %s", exc)
                break

    return fallback


async def _fetch_transcript_supadata(
    video_id: str, api_key: str
) -> tuple[list[dict], str]:
    """Fetch transcript via Supadata API.

    Handles both immediate responses and async jobs (HTTP 202) for
    videos longer than ~20 minutes.
    """
    url = "https://api.supadata.ai/v1/transcript"
    params = {
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "text": "false",
    }
    headers = {"x-api-key": api_key}

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url, params=params, headers=headers)

        if resp.status_code == 202:
            # Async job for long videos — poll until ready
            job_data = resp.json()
            job_id = job_data.get("jobId")
            if not job_id:
                raise AppError(
                    "supadata_error",
                    "Supadata returned async job without jobId",
                    status_code=502,
                )
            logger.info("Supadata async job started: %s", job_id)
            job_url = f"https://api.supadata.ai/v1/transcript/{job_id}"
            for attempt in range(30):  # up to ~5 minutes
                await asyncio.sleep(10)
                poll_resp = await client.get(job_url, headers=headers)
                if poll_resp.status_code == 200:
                    resp = poll_resp
                    break
                if poll_resp.status_code != 202:
                    raise AppError(
                        "supadata_error",
                        f"Supadata job poll failed: HTTP {poll_resp.status_code}",
                        status_code=502,
                    )
            else:
                raise AppError(
                    "supadata_timeout",
                    "Supadata async transcript job timed out",
                    status_code=504,
                )

        if resp.status_code != 200:
            raise AppError(
                "supadata_error",
                f"Supadata API error: HTTP {resp.status_code} - {resp.text[:200]}",
                status_code=502,
            )

        data = resp.json()
        content = data.get("content", [])
        lang = data.get("lang", "en")
        entries = []
        for item in content:
            entries.append({
                "text": item.get("text", ""),
                "start": item.get("offset", 0) / 1000.0,  # ms -> seconds
                "duration": item.get("duration", 0) / 1000.0,
            })
        return entries, lang


async def _fetch_transcript_youtube_api(video_id: str) -> tuple[list[dict], str]:
    """Fallback: fetch transcript using youtube-transcript-api library."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as exc:
        raise AppError(
            "dependency_missing",
            "youtube-transcript-api is not installed",
            status_code=503,
        ) from exc

    ytt_api = YouTubeTranscriptApi()
    transcript_obj = ytt_api.fetch(video_id)
    entries = []
    for snippet in transcript_obj:
        entries.append({
            "text": snippet.text,
            "start": snippet.start,
            "duration": snippet.duration,
        })
    language = getattr(transcript_obj, "language", "en") if hasattr(transcript_obj, "language") else "en"
    return entries, language


async def fetch_transcript(video_id: str, settings: Settings) -> tuple[list[dict], str]:
    """Fetch video transcript.

    Primary: Supadata API (when API key is configured).
    Fallback: youtube-transcript-api library.

    Returns (transcript_entries, language) where each entry is
    {"text": str, "start": float, "duration": float}.
    """
    # Try Supadata API first if configured
    if settings.supadata_api_key:
        try:
            entries, lang = await _fetch_transcript_supadata(
                video_id, settings.supadata_api_key
            )
            logger.info(
                "Transcript fetched via Supadata for %s: %d entries, lang=%s",
                video_id, len(entries), lang,
            )
            return entries, lang
        except AppError:
            raise
        except Exception as exc:
            logger.warning(
                "Supadata fetch failed for %s, falling back to youtube-transcript-api: %s",
                video_id, exc,
            )

    # Fallback to youtube-transcript-api
    try:
        entries, lang = await _fetch_transcript_youtube_api(video_id)
        logger.info(
            "Transcript fetched via youtube-transcript-api for %s: %d entries",
            video_id, len(entries),
        )
        return entries, lang
    except AppError:
        raise
    except Exception as exc:
        logger.warning("Transcript fetch failed for %s: %s", video_id, exc)
        raise AppError(
            "transcript_unavailable",
            f"Could not fetch transcript for video {video_id}. The video may not have captions available.",
            status_code=422,
        ) from exc


def format_transcript_with_timestamps(entries: list[dict]) -> str:
    """Format transcript entries as ``[MM:SS-MM:SS] text`` per segment."""
    lines: list[str] = []
    for entry in entries:
        start = entry.get("start", 0)
        dur = entry.get("duration", 0)
        end = start + dur
        s_min, s_sec = int(start // 60), int(start % 60)
        e_min, e_sec = int(end // 60), int(end % 60)
        lines.append(f"[{s_min:02d}:{s_sec:02d}-{e_min:02d}:{e_sec:02d}] {entry.get('text', '')}")
    return "\n".join(lines)


def format_transcript_for_llm(entries: list[dict], max_chars: int = 100000) -> str:
    """Format transcript entries into a readable string for LLM consumption."""
    lines: list[str] = []
    total_chars = 0
    for entry in entries:
        start = entry.get("start", 0)
        minutes = int(start // 60)
        seconds = int(start % 60)
        timestamp = f"[{minutes:02d}:{seconds:02d}]"
        text = entry.get("text", "").strip()
        line = f"{timestamp} {text}"
        total_chars += len(line) + 1
        if total_chars > max_chars:
            lines.append("... (transcript truncated)")
            break
        lines.append(line)
    return "\n".join(lines)


def estimate_duration(entries: list[dict]) -> int:
    """Estimate video duration in seconds from transcript entries."""
    if not entries:
        return 0
    last = entries[-1]
    return int(last.get("start", 0) + last.get("duration", 0))

"""Chunked topic generation pipeline.

Ported from vendors/longcut/lib/ai-processing.ts.
Adapted for our BaseTextProvider.generate() interface.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.lib.quote_matcher import (
    TranscriptIndex,
    build_transcript_index,
    find_text_in_transcript,
    normalize_whitespace,
)
from app.lib.timestamp_utils import format_timestamp, parse_timestamp_range
from app.lib.topic_utils import hydrate_topics_with_transcript
from app.providers.base import BaseTextProvider

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_CHUNK_DURATION = 300  # 5 minutes
DEFAULT_CHUNK_OVERLAP = 45
CHUNK_MAX_CANDIDATES = 2
MAX_CONCURRENCY = 5


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass
class TranscriptChunk:
    id: str
    start: float
    end: float
    segments: list[dict]


@dataclass
class CandidateTopic:
    title: str
    quote: dict | None = None  # {"timestamp": str, "text": str}
    source_chunk_id: str = ""
    chunk_start: float = 0.0
    chunk_end: float = 0.0


@dataclass
class TopicResult:
    topics: list[dict] = field(default_factory=list)
    candidates: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Transcript formatting helpers
# ---------------------------------------------------------------------------

def format_transcript_with_timestamps(segments: list[dict]) -> str:
    """Format transcript segments as ``[MM:SS-MM:SS] text`` lines."""
    lines: list[str] = []
    for seg in segments:
        start = format_timestamp(seg["start"])
        end = format_timestamp(seg["start"] + seg["duration"])
        lines.append(f"[{start}-{end}] {seg['text']}")
    return "\n".join(lines)


def _combine_transcript(segments: list[dict]) -> str:
    return " ".join(s["text"] for s in segments)


def _format_video_info(video_info: dict | None) -> str:
    if not video_info:
        return "Unknown video title and speaker"
    parts: list[str] = []
    if video_info.get("title"):
        parts.append(f"Title: {video_info['title']}")
    if video_info.get("author"):
        parts.append(f"Speaker: {video_info['author']}")
    if video_info.get("description"):
        parts.append(f"Description: {video_info['description']}")
    return "\n".join(parts) if parts else "Unknown video title and speaker"


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_transcript(
    segments: list[dict],
    chunk_duration: int = DEFAULT_CHUNK_DURATION,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[TranscriptChunk]:
    """Divide transcript into overlapping time windows."""
    if not segments:
        return []

    last = segments[-1]
    total_duration = last["start"] + last["duration"]

    eff_chunk = max(180, chunk_duration)
    eff_overlap = min(max(overlap, 0), eff_chunk // 2)
    step = max(60, eff_chunk - eff_overlap)

    chunks: list[TranscriptChunk] = []
    window_start = segments[0]["start"]
    anchor = 0

    while window_start < total_duration and anchor < len(segments):
        # Advance anchor past segments that end before window_start
        while anchor < len(segments) and segments[anchor]["start"] + segments[anchor]["duration"] <= window_start:
            anchor += 1
        if anchor >= len(segments):
            break

        chunk_segs: list[dict] = []
        idx = anchor
        window_end_target = window_start + eff_chunk
        window_end = window_start

        while idx < len(segments):
            seg = segments[idx]
            seg_end = seg["start"] + seg["duration"]
            if seg["start"] > window_end_target and chunk_segs:
                break
            chunk_segs.append(seg)
            window_end = max(window_end, seg_end)
            if seg_end >= window_end_target and chunk_segs:
                break
            idx += 1

        if not chunk_segs:
            chunk_segs.append(segments[anchor])

        c_start = chunk_segs[0]["start"]
        c_end = chunk_segs[-1]["start"] + chunk_segs[-1]["duration"]

        chunks.append(TranscriptChunk(
            id=f"chunk-{len(chunks) + 1}",
            start=c_start,
            end=c_end,
            segments=chunk_segs,
        ))
        window_start = c_start + step

    # Tail coverage
    if chunks:
        last_chunk = chunks[-1]
        gap = total_duration - last_chunk.end
        if gap > 5:
            tail_start_time = max(segments[0]["start"], total_duration - eff_chunk)
            tail_segs = [s for s in segments if s["start"] + s["duration"] >= tail_start_time]
            if tail_segs:
                tail_end = tail_segs[-1]["start"] + tail_segs[-1]["duration"]
                if tail_end > last_chunk.end + 1:
                    chunks.append(TranscriptChunk(
                        id=f"chunk-{len(chunks) + 1}",
                        start=tail_segs[0]["start"],
                        end=tail_end,
                        segments=tail_segs,
                    ))

    return chunks


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _build_chunk_prompt(
    chunk: TranscriptChunk,
    max_candidates: int,
    video_info: dict | None = None,
) -> str:
    transcript = format_transcript_with_timestamps(chunk.segments)
    chunk_window = f"[{format_timestamp(chunk.start)}-{format_timestamp(chunk.end)}]"
    info_block = _format_video_info(video_info)

    chunk_duration = max(0, round(chunk.end - chunk.start))
    if chunk_duration > 0 and chunk_duration < 45:
        dur_instr = (
            f"  <item>Each highlight must include a punchy, specific title (max 10 words) "
            f"and a contiguous quote that fits within this {chunk_duration}s chunk.</item>"
        )
    elif chunk_duration > 0 and chunk_duration <= 75:
        dur_instr = (
            f"  <item>Each highlight must include a punchy, specific title (max 10 words) "
            f"and a contiguous quote up to {chunk_duration}s that stands alone.</item>"
        )
    else:
        dur_instr = (
            "  <item>Each highlight must include a punchy, specific title (max 10 words) "
            "and a contiguous quote lasting roughly 45-75 seconds.</item>"
        )

    return f"""<task>
<role>You are an expert content strategist reviewing a portion of a video transcript.</role>
<context>
{info_block}
Chunk window: {chunk_window}
</context>
<goal>Identify up to {max_candidates} compelling highlight reel ideas that originate entirely within this transcript slice.</goal>
<instructions>
  <item>Only use content from this chunk. If nothing stands out, return an empty list.</item>
{dur_instr}
  <item>Write titles as concise statements (avoid question marks unless the quote itself is a question).</item>
  <item>Quote text must match the transcript exactly—no paraphrasing, ellipses, or stitching from multiple places.</item>
  <item>Use absolute timestamps in [MM:SS-MM:SS] format that match the transcript lines.</item>
  <item>Focus on contrarian insights, vivid stories, or data-backed arguments that could stand alone.</item>
</instructions>
<outputFormat>Return strict JSON with at most {max_candidates} entries: [{{"title":"string","quote":{{"timestamp":"[MM:SS-MM:SS]","text":"exact transcript text"}}}}]</outputFormat>
<transcriptChunk><![CDATA[
{transcript}
]]></transcriptChunk>
</task>"""


def _build_reduce_prompt(
    candidates: list[CandidateTopic],
    max_topics: int,
    video_info: dict | None = None,
    min_topics: int = 0,
    segment_label: str = "",
) -> str:
    info_block = _format_video_info(video_info)
    seg_ctx = f"Focus: {segment_label} of the video." if segment_label else ""
    safe_min = max(0, min(min_topics, max_topics))

    if safe_min > 0:
        guidance = (
            f"Return between {safe_min} and {max_topics} standout highlights. "
            f"If fewer than {safe_min} candidates truly meet the quality bar, "
            f"respond with only the clips that do. Never exceed {max_topics}."
        )
    else:
        guidance = (
            f"Return up to {max_topics} standout highlights that maximize diversity, "
            f"insight, and narrative punch while reusing the provided quotes."
        )

    cand_block_parts: list[str] = []
    for i, c in enumerate(candidates):
        ts = c.quote.get("timestamp", "[??:??-??:??]") if c.quote else "[??:??-??:??]"
        qt = c.quote.get("text", "") if c.quote else ""
        cw = f"[{format_timestamp(c.chunk_start)}-{format_timestamp(c.chunk_end)}]"
        cand_block_parts.append(
            f"Candidate {i + 1}\n"
            f"Chunk window: {cw}\n"
            f"Original title: {c.title}\n"
            f"Quote timestamp: {ts}\n"
            f"Quote text: {qt}"
        )
    cand_block = "\n\n".join(cand_block_parts)

    return f"""<task>
<role>You are a senior editorial strategist assembling the final highlight reel lineup.</role>
<context>
{info_block}
You have {len(candidates)} candidate quotes extracted from the transcript.
{seg_ctx}
</context>
<goal>Choose the strongest highlights for this segment of the video.</goal>
<instructions>
  <item>{guidance}</item>
  <item>Review the candidates and choose the strongest, most distinct ideas within this segment.</item>
  <item>If two candidates overlap, keep the better one.</item>
  <item>You may rewrite titles for clarity, but you must keep the quote text and timestamp as provided.</item>
  <item>Respond with strict JSON: [{{"candidateIndex":number,"title":"string"}}]. Indices are 1-based and reference the numbered candidates below.</item>
</instructions>
<candidates><![CDATA[
{cand_block}
]]></candidates>
</task>"""


# ---------------------------------------------------------------------------
# Provider call helpers
# ---------------------------------------------------------------------------

async def _generate_with_fallback(
    messages: list[dict],
    provider: BaseTextProvider,
    fallback_provider: BaseTextProvider | None,
) -> str:
    """Try provider; on failure retry with fallback."""
    try:
        return await provider.generate(messages)
    except Exception as exc:
        if fallback_provider is None:
            raise
        logger.warning("Primary provider failed (%s), using fallback", exc)
        return await fallback_provider.generate(messages)


def _parse_json_array(text: str) -> list[dict]:
    """Extract a JSON array from LLM output."""
    text = text.strip()
    # Try to find JSON array in the response
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return []


# ---------------------------------------------------------------------------
# Candidate generation
# ---------------------------------------------------------------------------

async def _generate_candidates_for_chunk(
    chunk: TranscriptChunk,
    provider: BaseTextProvider,
    fallback_provider: BaseTextProvider | None,
    video_info: dict | None,
    max_candidates: int = CHUNK_MAX_CANDIDATES,
) -> list[CandidateTopic]:
    """Generate candidate topics from a single chunk."""
    prompt = _build_chunk_prompt(chunk, max_candidates, video_info)
    messages = [{"role": "user", "content": prompt}]

    try:
        text = await _generate_with_fallback(messages, provider, fallback_provider)
        parsed = _parse_json_array(text)
    except Exception as exc:
        logger.warning("Chunk %s generation failed: %s", chunk.id, exc)
        return []

    candidates: list[CandidateTopic] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        title = item.get("title", "")
        quote = item.get("quote")
        if not title or not isinstance(quote, dict):
            continue
        if not quote.get("timestamp") or not quote.get("text"):
            continue
        candidates.append(CandidateTopic(
            title=title,
            quote=quote,
            source_chunk_id=chunk.id,
            chunk_start=chunk.start,
            chunk_end=chunk.end,
        ))
    return candidates


def _dedupe_candidates(candidates: list[CandidateTopic]) -> list[CandidateTopic]:
    """Remove duplicate candidates by timestamp + normalized text key."""
    seen: set[str] = set()
    result: list[CandidateTopic] = []
    for c in candidates:
        if not c.quote or not c.quote.get("timestamp") or not c.quote.get("text"):
            continue
        key = f"{c.quote['timestamp']}|{normalize_whitespace(c.quote['text'])}"
        if key in seen:
            continue
        seen.add(key)
        result.append(c)
    return result


# ---------------------------------------------------------------------------
# Candidate reduction
# ---------------------------------------------------------------------------

async def _reduce_candidates(
    candidates: list[CandidateTopic],
    provider: BaseTextProvider,
    fallback_provider: BaseTextProvider | None,
    video_info: dict | None,
    max_topics: int = 5,
    min_topics: int = 0,
    segment_label: str = "",
) -> list[dict]:
    """Use LLM to select best N topics from candidate pool."""
    if not candidates:
        return []

    constrained_max = min(max_topics, len(candidates))
    if constrained_max <= 0:
        return []
    constrained_min = min(min_topics, constrained_max)

    prompt = _build_reduce_prompt(candidates, constrained_max, video_info, constrained_min, segment_label)
    messages = [{"role": "user", "content": prompt}]

    selections: list[dict] = []
    try:
        text = await _generate_with_fallback(messages, provider, fallback_provider)
        selections = _parse_json_array(text)
    except Exception as exc:
        logger.warning("Reduce step failed: %s", exc)

    used: set[int] = set()
    reduced: list[dict] = []

    if isinstance(selections, list):
        for sel in selections:
            if not isinstance(sel, dict):
                continue
            idx = sel.get("candidateIndex", 0) - 1  # 1-based → 0-based
            if idx < 0 or idx >= len(candidates) or idx in used:
                continue
            c = candidates[idx]
            if not c.quote or not c.quote.get("text") or not c.quote.get("timestamp"):
                continue
            reduced.append({
                "title": (sel.get("title") or c.title).strip(),
                "quote": c.quote,
            })
            used.add(idx)
            if len(reduced) >= constrained_max:
                break

    # Fallback: take first N
    if not reduced and min_topics > 0:
        for c in candidates[: min(min_topics, constrained_max)]:
            reduced.append({"title": c.title, "quote": c.quote})

    return reduced


# ---------------------------------------------------------------------------
# Quote-to-segment hydration
# ---------------------------------------------------------------------------

def _hydrate_with_segments(
    parsed_topics: list[dict],
    transcript: list[dict],
    index: TranscriptIndex,
) -> list[dict]:
    """Map parsed AI topics (title + quote) to transcript segments."""
    return hydrate_topics_with_transcript(parsed_topics, transcript, index)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_topics_from_transcript(
    segments: list[dict],
    provider: BaseTextProvider,
    fallback_provider: BaseTextProvider | None,
    video_info: dict | None = None,
    *,
    max_topics: int = 5,
    chunk_duration: int = DEFAULT_CHUNK_DURATION,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> TopicResult:
    """Full map/reduce pipeline for topic generation.

    1. Chunk transcript into overlapping windows.
    2. Generate 2 candidates per chunk (with concurrency limit).
    3. Deduplicate candidates.
    4. Reduce to best *max_topics* via LLM.
    5. Hydrate with precise transcript segments via quote matcher.

    Returns ``TopicResult`` with hydrated topics.
    """
    if not segments:
        return TopicResult()

    # Build transcript index once
    index = build_transcript_index(segments)

    # 1. Chunk
    chunks = chunk_transcript(segments, chunk_duration, chunk_overlap)
    if not chunks:
        return TopicResult()

    # 2. Generate candidates (parallel with semaphore)
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def _gen(chunk: TranscriptChunk) -> list[CandidateTopic]:
        async with sem:
            return await _generate_candidates_for_chunk(
                chunk, provider, fallback_provider, video_info
            )

    results = await asyncio.gather(*[_gen(c) for c in chunks])
    all_candidates: list[CandidateTopic] = []
    for r in results:
        all_candidates.extend(r)

    # 3. Deduplicate
    unique = _dedupe_candidates(all_candidates)
    if not unique:
        return TopicResult()

    # 4. Reduce – split into two halves for diversity
    requested = max(1, min(max_topics, 5))
    boundary = int(len(unique) * 0.6)
    first_half = unique[:boundary] if boundary > 0 else unique
    second_half = unique[boundary:] if boundary < len(unique) else []

    first_target = min(3, requested)
    second_target = requested - first_target

    first_reduced = await _reduce_candidates(
        first_half, provider, fallback_provider, video_info,
        max_topics=first_target, min_topics=min(2, first_target),
        segment_label="first portion",
    )
    second_reduced: list[dict] = []
    if second_half and second_target > 0:
        second_reduced = await _reduce_candidates(
            second_half, provider, fallback_provider, video_info,
            max_topics=second_target, min_topics=min(1, second_target),
            segment_label="latter portion",
        )

    all_reduced = first_reduced + second_reduced
    if not all_reduced:
        # Last-resort: use top N candidates as-is
        all_reduced = [
            {"title": c.title, "quote": c.quote}
            for c in unique[:requested]
        ]

    # 5. Hydrate with precise segments
    hydrated = _hydrate_with_segments(all_reduced, segments, index)

    # Sort by start time
    def _start_time(t: dict) -> float:
        segs = t.get("segments", [])
        if segs:
            return segs[0].get("start", 0)
        q = t.get("quote", {})
        rng = parse_timestamp_range(q.get("timestamp", "")) if q else None
        return rng[0] if rng else 0

    hydrated.sort(key=_start_time)

    return TopicResult(
        topics=hydrated,
        candidates=[
            {"title": c.title, "quote": c.quote, "chunkStart": c.chunk_start, "chunkEnd": c.chunk_end}
            for c in unique
        ],
    )

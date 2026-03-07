"""Topic hydration – map AI-quoted text to precise transcript segment boundaries.

Ported from vendors/longcut/lib/topic-utils.ts.
"""

from __future__ import annotations

import math
from typing import Any

from app.lib.quote_matcher import (
    TranscriptIndex,
    build_transcript_index,
    find_text_in_transcript,
)
from app.lib.timestamp_utils import parse_timestamp_range


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _coerce_number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            v = float(value)
            return v if math.isfinite(v) else None
        except ValueError:
            return None
    return None


def _normalize_transcript(segments: list[dict] | None) -> list[dict]:
    if not isinstance(segments, list):
        return []
    result: list[dict] = []
    for seg in segments:
        if not seg:
            continue
        start = _coerce_number(seg.get("start"))
        dur = _coerce_number(seg.get("duration"))
        if start is None or dur is None:
            continue
        text = seg.get("text", "")
        if not isinstance(text, str):
            text = str(text) if text is not None else ""
        result.append({"text": text, "start": start, "duration": dur})
    return result


def _compute_duration(segments: list[dict]) -> float:
    total = 0.0
    for seg in segments:
        s = _coerce_number(seg.get("start"))
        e = _coerce_number(seg.get("end"))
        if s is not None and e is not None:
            total += max(0.0, e - s)
    return total


def _approximate_time_offset(segment: dict, char_offset: int | None) -> float:
    dur = _coerce_number(segment.get("duration"))
    if dur is None or dur <= 0:
        return 0.0
    text = segment.get("text", "")
    if not isinstance(char_offset, (int, float)) or not text:
        return 0.0
    safe_len = max(1, len(text))
    clamped = max(0, min(int(char_offset), safe_len))
    return dur * (clamped / safe_len)


def _find_segment_index_by_time(transcript: list[dict], time: float) -> int:
    if not math.isfinite(time):
        return -1
    for i, seg in enumerate(transcript):
        seg_end = seg["start"] + seg["duration"]
        if seg["start"] <= time <= seg_end:
            return i
        if time < seg["start"]:
            return max(0, i - 1)
    return len(transcript) - 1 if transcript else -1


def _create_segment_from_match(
    match: Any, transcript: list[dict], preferred_text: str | None = None
) -> dict | None:
    start_seg = transcript[match.start_segment_idx] if match.start_segment_idx < len(transcript) else None
    end_seg = transcript[match.end_segment_idx] if match.end_segment_idx < len(transcript) else None
    if not start_seg or not end_seg:
        return None

    start_offset = _approximate_time_offset(start_seg, match.start_char_offset)
    end_char = match.end_char_offset if isinstance(match.end_char_offset, (int, float)) else len(end_seg["text"])
    end_offset = _approximate_time_offset(end_seg, end_char)

    start_time = start_seg["start"] + start_offset
    end_time = end_seg["start"] + end_offset
    if not math.isfinite(end_time) or end_time <= start_time:
        end_time = end_seg["start"] + end_seg.get("duration", 0)
        if end_time <= start_time:
            end_time = start_time + max(5, end_seg.get("duration", 0))

    fallback_text = " ".join(
        s["text"] for s in transcript[match.start_segment_idx : match.end_segment_idx + 1]
    ).strip()

    return {
        "start": start_time,
        "end": end_time,
        "text": (preferred_text or fallback_text or "").strip(),
        "startSegmentIdx": match.start_segment_idx,
        "endSegmentIdx": match.end_segment_idx,
        "startCharOffset": match.start_char_offset if isinstance(match.start_char_offset, int) else 0,
        "endCharOffset": int(end_char),
        "hasCompleteSentences": match.match_strategy != "fuzzy-ngram",
    }


def _create_segment_from_timestamp(
    timestamp: str | None, transcript: list[dict], preferred_text: str | None = None
) -> dict | None:
    rng = parse_timestamp_range(timestamp) if timestamp else None
    if not rng:
        return None
    range_start, range_end = rng

    start_idx = _find_segment_index_by_time(transcript, range_start)
    end_idx = _find_segment_index_by_time(transcript, range_end)
    if start_idx == -1:
        start_idx = 0
    if end_idx == -1:
        end_idx = len(transcript) - 1
    if end_idx < start_idx:
        end_idx = start_idx

    start_seg = transcript[start_idx]
    end_seg = transcript[end_idx]

    start_time = max(start_seg["start"], min(range_start, start_seg["start"] + start_seg["duration"]))
    end_time = min(
        end_seg["start"] + end_seg["duration"],
        max(range_end, start_time + max(5, end_seg.get("duration", 0))),
    )
    if end_time <= start_time:
        end_time = start_time + max(5, end_seg.get("duration", 0))

    combined_text = " ".join(s["text"] for s in transcript[start_idx : end_idx + 1]).strip()

    return {
        "start": start_time,
        "end": end_time,
        "text": (preferred_text or combined_text or "").strip(),
        "startSegmentIdx": start_idx,
        "endSegmentIdx": end_idx,
        "startCharOffset": 0,
        "endCharOffset": len(end_seg["text"]),
        "hasCompleteSentences": False,
    }


def _create_fallback_segment(transcript: list[dict]) -> dict | None:
    if not transcript:
        return None
    start = transcript[0]
    end_idx = 0
    end_time = start["start"]
    for i, seg in enumerate(transcript):
        end_idx = i
        end_time = seg["start"] + seg["duration"]
        if end_time - start["start"] >= 60:
            break
    combined = " ".join(s["text"] for s in transcript[: end_idx + 1]).strip()
    return {
        "start": start["start"],
        "end": end_time,
        "text": combined,
        "startSegmentIdx": 0,
        "endSegmentIdx": end_idx,
        "startCharOffset": 0,
        "endCharOffset": len(transcript[end_idx]["text"]),
        "hasCompleteSentences": False,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def hydrate_topics_with_transcript(
    topics: list[dict] | None,
    transcript: list[dict] | None,
    index: TranscriptIndex | None = None,
) -> list[dict]:
    """Map AI-generated topics to precise transcript segment boundaries.

    Each topic dict should contain at minimum ``title`` and optionally
    ``quote: {"timestamp": "[MM:SS-MM:SS]", "text": "..."}``.

    Returns topics enriched with ``segments`` and ``duration``.
    """
    if not isinstance(topics, list) or not topics:
        return topics if isinstance(topics, list) else []

    norm_transcript = _normalize_transcript(transcript)
    has_transcript = len(norm_transcript) > 0

    if has_transcript and index is None:
        index = build_transcript_index(norm_transcript)

    result: list[dict] = []
    for topic in topics:
        segments: list[dict] = []

        if has_transcript and index is not None:
            quote = topic.get("quote")
            quote_text = quote.get("text", "") if isinstance(quote, dict) else ""
            quote_ts = quote.get("timestamp") if isinstance(quote, dict) else None

            # Strategy 1: match quote text
            if quote_text:
                match = find_text_in_transcript(
                    norm_transcript,
                    quote_text,
                    index,
                    min_similarity=0.75,
                )
                if match:
                    seg = _create_segment_from_match(match, norm_transcript, quote_text)
                    if seg:
                        segments = [seg]

            # Strategy 2: fallback to timestamp range
            if not segments:
                seg = _create_segment_from_timestamp(quote_ts, norm_transcript, quote_text)
                if seg:
                    segments = [seg]

            # Strategy 3: first 60s fallback
            if not segments:
                seg = _create_fallback_segment(norm_transcript)
                if seg:
                    segments = [seg]

        duration_secs = _compute_duration(segments)
        duration = round(duration_secs) if duration_secs > 0 else topic.get("duration", 0)

        result.append({**topic, "segments": segments, "duration": duration})

    return result

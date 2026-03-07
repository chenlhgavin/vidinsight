"""Timestamp parsing and formatting utilities."""

from __future__ import annotations

import re

# Strict regex for timestamp range like [MM:SS-MM:SS] or [HH:MM:SS-HH:MM:SS]
TIMESTAMP_RANGE_RE = re.compile(
    r"^\[?((?:\d{1,2}:)?\d{1,2}:\d{1,2})-((?:\d{1,2}:)?\d{1,2}:\d{1,2})\]?$"
)


def parse_timestamp(ts: str) -> int | None:
    """Parse "MM:SS" or "HH:MM:SS" to total seconds. Returns None on failure."""
    m = re.match(r"^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})$", ts.strip())
    if not m:
        return None
    hours = int(m.group(1)) if m.group(1) else 0
    minutes = int(m.group(2))
    seconds = int(m.group(3))
    if hours < 0 or hours >= 24 or minutes < 0 or minutes >= 60 or seconds < 0 or seconds >= 60:
        return None
    return hours * 3600 + minutes * 60 + seconds


def format_timestamp(total_seconds: int | float) -> str:
    """Format seconds to "MM:SS" or "H:MM:SS"."""
    total = int(total_seconds)
    hours = total // 3600
    minutes = (total % 3600) // 60
    seconds = total % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def parse_timestamp_range(range_str: str) -> tuple[int, int] | None:
    """Parse "[MM:SS-MM:SS]" to (start_seconds, end_seconds). Returns None on failure."""
    if not range_str:
        return None
    m = TIMESTAMP_RANGE_RE.match(range_str.strip())
    if not m:
        return None
    start = parse_timestamp(m.group(1))
    end = parse_timestamp(m.group(2))
    if start is None or end is None or end <= start:
        return None
    return (start, end)

"""Quote-to-transcript matching with multi-strategy fallback.

Ported from vendors/longcut/lib/quote-matcher.ts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
FUZZY_MATCH_THRESHOLD = 0.85
MIN_FUZZY_SCORE = 0.7
N_GRAM_SIZE = 3


# ---------------------------------------------------------------------------
# Text normalisation helpers
# ---------------------------------------------------------------------------

def normalize_whitespace(text: str) -> str:
    """Replace newlines with spaces and collapse multiple spaces."""
    return re.sub(r"\s+", " ", text.replace("\r", " ").replace("\n", " ")).strip()


def normalize_for_matching(text: str) -> str:
    """Lowercase, strip common punctuation, collapse whitespace."""
    out = text.lower()
    out = re.sub(r'[.,?"""\'\'!—…–]', "", out)
    out = re.sub(r"\s+", " ", out)
    return out.strip()


# ---------------------------------------------------------------------------
# N-gram Jaccard similarity
# ---------------------------------------------------------------------------

def calculate_ngram_similarity(str1: str, str2: str) -> float:
    """Calculate 3-gram Jaccard similarity (0-1)."""
    if not str1 or not str2:
        return 0.0
    clean1 = re.sub(r"\s+", "", str1)
    clean2 = re.sub(r"\s+", "", str2)

    def _ngrams(s: str) -> set[str]:
        return {s[i : i + N_GRAM_SIZE] for i in range(len(s) - N_GRAM_SIZE + 1)}

    ng1 = _ngrams(clean1)
    ng2 = _ngrams(clean2)

    if not ng1 or not ng2:
        # Very short strings – fall back to substring check
        return 0.8 if (clean1 in clean2 or clean2 in clean1) else 0.0

    intersection = len(ng1 & ng2)
    union = len(ng1 | ng2)
    return intersection / union if union else 0.0


# ---------------------------------------------------------------------------
# Transcript index
# ---------------------------------------------------------------------------

@dataclass
class SegmentBoundary:
    segment_idx: int
    start_pos: int
    end_pos: int
    text: str
    normalized_text: str


@dataclass
class TranscriptIndex:
    full_text_space: str = ""
    normalized_text: str = ""
    segment_boundaries: list[SegmentBoundary] = field(default_factory=list)
    word_index: dict[str, list[int]] = field(default_factory=dict)
    ngram_index: dict[str, set[int]] = field(default_factory=dict)


def build_transcript_index(segments: list[dict]) -> TranscriptIndex:
    """Build a comprehensive search index from transcript segments.

    Each segment is ``{"text": str, "start": float, "duration": float}``.
    """
    idx = TranscriptIndex()
    full_parts: list[str] = []
    norm_parts: list[str] = []

    for i, seg in enumerate(segments):
        seg_text = seg.get("text", "")
        seg_norm = normalize_for_matching(seg_text)

        start_pos = sum(len(p) for p in full_parts) + len(full_parts)  # +spaces
        full_parts.append(seg_text)
        norm_parts.append(seg_norm)

        boundary = SegmentBoundary(
            segment_idx=i,
            start_pos=start_pos,
            end_pos=start_pos + len(seg_text),
            text=seg_text,
            normalized_text=seg_norm,
        )
        idx.segment_boundaries.append(boundary)

        # Word index
        for word in seg_norm.split():
            if len(word) > 2:
                idx.word_index.setdefault(word, []).append(i)

        # N-gram index
        clean = seg_norm.replace(" ", "")
        for j in range(len(clean) - N_GRAM_SIZE + 1):
            ng = clean[j : j + N_GRAM_SIZE]
            idx.ngram_index.setdefault(ng, set()).add(i)

    idx.full_text_space = " ".join(full_parts)
    idx.normalized_text = " ".join(norm_parts)
    return idx


# ---------------------------------------------------------------------------
# Match result
# ---------------------------------------------------------------------------

@dataclass
class MatchResult:
    found: bool
    start_segment_idx: int
    end_segment_idx: int
    start_char_offset: int
    end_char_offset: int
    match_strategy: str
    similarity: float
    confidence: float


# ---------------------------------------------------------------------------
# Segment mapping helpers
# ---------------------------------------------------------------------------

def map_match_to_segments(
    match_start: int, match_length: int, index: TranscriptIndex
) -> MatchResult | None:
    """Map a character position in *full_text_space* to segment boundaries."""
    match_end = match_start + match_length
    start_seg = -1
    end_seg = -1
    start_off = 0
    end_off = 0

    for b in index.segment_boundaries:
        if start_seg == -1 and b.start_pos <= match_start < b.end_pos:
            start_seg = b.segment_idx
            start_off = match_start - b.start_pos
        if match_end > b.start_pos and match_end <= b.end_pos:
            end_seg = b.segment_idx
            end_off = match_end - b.start_pos
            break
        if match_end > b.end_pos:
            end_seg = b.segment_idx
            end_off = len(b.text)

    if start_seg != -1 and end_seg != -1:
        return MatchResult(
            found=True,
            start_segment_idx=start_seg,
            end_segment_idx=end_seg,
            start_char_offset=start_off,
            end_char_offset=end_off,
            match_strategy="",
            similarity=0.0,
            confidence=0.0,
        )
    return None


def _map_normalized_match_to_segments(
    norm_idx: int, norm_text: str, index: TranscriptIndex
) -> MatchResult | None:
    """Map a match in *normalized_text* back to original segment boundaries."""
    match_end = norm_idx + len(norm_text)
    cur = 0
    start_seg = -1
    end_seg = -1
    start_off = 0
    end_off = 0

    for b in index.segment_boundaries:
        seg_end = cur + len(b.normalized_text)
        if start_seg == -1 and cur <= norm_idx < seg_end:
            start_seg = b.segment_idx
            off = norm_idx - cur
            start_off = min(off, len(b.text) - 1)
        if match_end > cur and match_end <= seg_end:
            end_seg = b.segment_idx
            off = match_end - cur
            end_off = min(off, len(b.text))
            break
        cur = seg_end + 1  # account for space between segments

    if start_seg != -1 and end_seg != -1:
        return MatchResult(
            found=True,
            start_segment_idx=start_seg,
            end_segment_idx=end_seg,
            start_char_offset=start_off,
            end_char_offset=end_off,
            match_strategy="",
            similarity=0.0,
            confidence=0.0,
        )
    return None


# ---------------------------------------------------------------------------
# Main search function
# ---------------------------------------------------------------------------

def find_text_in_transcript(
    segments: list[dict],
    target_text: str,
    index: TranscriptIndex,
    *,
    start_idx: int = 0,
    min_similarity: float = FUZZY_MATCH_THRESHOLD,
    max_segment_window: int = 30,
) -> MatchResult | None:
    """Multi-strategy text matching: exact → normalized → fuzzy n-gram."""

    # --- Strategy 1: exact substring via Python's `str.find` (BMH internally) ---
    pos = index.full_text_space.find(target_text)
    if pos != -1:
        result = map_match_to_segments(pos, len(target_text), index)
        if result is not None:
            result.match_strategy = "exact"
            result.similarity = 1.0
            result.confidence = 1.0
            return result

    # --- Strategy 2: normalised match ---
    norm_target = normalize_whitespace(target_text)
    norm_pos = index.normalized_text.find(norm_target)
    if norm_pos != -1:
        result = _map_normalized_match_to_segments(norm_pos, norm_target, index)
        if result is not None:
            result.match_strategy = "normalized"
            result.similarity = 0.95
            result.confidence = 0.95
            return result

    # --- Strategy 3: fuzzy n-gram matching guided by word index ---
    target_words = [
        w for w in normalize_for_matching(target_text).split() if len(w) > 2
    ]
    if not target_words:
        return None

    segment_scores: dict[int, int] = {}
    for word in target_words:
        for seg_idx in index.word_index.get(word, []):
            if seg_idx >= start_idx:
                segment_scores[seg_idx] = segment_scores.get(seg_idx, 0) + 1

    scored = sorted(segment_scores.items(), key=lambda x: x[1], reverse=True)[:15]
    norm_target_for_match = normalize_for_matching(target_text)

    for candidate_idx, score in scored:
        window_start = max(0, candidate_idx - 2)
        window_end = min(len(segments) - 1, candidate_idx + max_segment_window)
        combined = ""
        for i in range(window_start, window_end + 1):
            if i > window_start:
                combined += " "
            combined += segments[i].get("text", "")
            sim = calculate_ngram_similarity(
                norm_target_for_match, normalize_for_matching(combined)
            )
            if sim >= min_similarity:
                return MatchResult(
                    found=True,
                    start_segment_idx=window_start,
                    end_segment_idx=i,
                    start_char_offset=0,
                    end_char_offset=len(segments[i].get("text", "")),
                    match_strategy="fuzzy-ngram",
                    similarity=sim,
                    confidence=min(1.0, score / len(target_words)),
                )

    return None

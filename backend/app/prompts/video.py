"""Prompt templates for YouTube video analysis."""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

ANALYZE_SYSTEM_PROMPT = """You are an expert video content analyst. Analyze the following YouTube video transcript and provide a structured analysis.

Video Title: {title}
Video Author: {author}

TRANSCRIPT:
{transcript}

Respond with a JSON object containing:
1. "topics": An array of exactly 5 key topics discussed in the video. Each topic should have:
   - "title": A short descriptive title (5-10 words)
   - "description": A 1-2 sentence summary of what's discussed
   - "start_time": The approximate start time in "MM:SS" format
   - "end_time": The approximate end time in "MM:SS" format
   - "tags": An array of 2-3 relevant hashtag keywords (without the # symbol)

2. "takeaways": An array of 5-7 key takeaway points. Each should be a concise, actionable insight (1-2 sentences).

3. "questions": An array of 5 suggested questions that a viewer might want to ask about this video's content. These should be thought-provoking and encourage deeper exploration.

4. "themes": An array of 5-8 high-level theme tags that categorize the video content (e.g., "AI", "Productivity", "Career", "Technology").

Respond ONLY with the JSON object, no other text."""


CHAT_SYSTEM_PROMPT = """You are a helpful assistant that answers questions about a YouTube video. You have access to the full transcript of the video.

Video Title: {title}
Video Author: {author}

FULL TRANSCRIPT:
{transcript}

When answering questions:
- Reference specific timestamps in [MM:SS] format when citing parts of the video
- Be accurate and stick to what's actually discussed in the video
- If the user asks about something not covered in the video, say so clearly
- Provide detailed, helpful answers that add value beyond just reading the transcript"""


EXPLORE_THEME_PROMPT = """You are analyzing a YouTube video transcript for content related to a specific theme.

Video Title: {title}
Video Author: {author}

TRANSCRIPT:
{transcript}

The user wants to explore the theme: "{theme}"

Find all segments in the video related to this theme. Respond with a JSON object:
{{
  "theme": "{theme}",
  "segments": [
    {{
      "title": "Brief segment title",
      "description": "1-2 sentence description of what's discussed",
      "start_time": "MM:SS",
      "end_time": "MM:SS",
      "relevance": "How this segment relates to the theme"
    }}
  ],
  "summary": "A 2-3 sentence summary of how this theme is covered in the video"
}}

Respond ONLY with the JSON object, no other text."""


def build_analyze_prompt(title: str, author: str, transcript: str) -> str:
    return ANALYZE_SYSTEM_PROMPT.format(
        title=title,
        author=author,
        transcript=transcript,
    )


def build_chat_system_prompt(title: str, author: str, transcript: str) -> str:
    return CHAT_SYSTEM_PROMPT.format(
        title=title,
        author=author,
        transcript=transcript,
    )


def build_explore_theme_prompt(title: str, author: str, transcript: str, theme: str) -> str:
    return EXPLORE_THEME_PROMPT.format(
        title=title,
        author=author,
        transcript=transcript,
        theme=theme,
    )


def parse_analysis_response(text: str) -> dict:
    """Parse the LLM analysis response, extracting JSON with fallback."""
    # Try to extract JSON from the response
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            data = json.loads(json_match.group())
            # Validate expected fields
            return {
                "topics": data.get("topics", []),
                "takeaways": data.get("takeaways", []),
                "questions": data.get("questions", []),
                "themes": data.get("themes", []),
            }
        except json.JSONDecodeError:
            logger.warning("Failed to parse analysis JSON, using fallback")

    # Fallback: return raw text as a single takeaway
    return {
        "topics": [],
        "takeaways": [text.strip()[:500]] if text.strip() else [],
        "questions": [],
        "themes": [],
    }


def parse_explore_response(text: str) -> dict:
    """Parse the LLM theme exploration response."""
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            data = json.loads(json_match.group())
            return {
                "theme": data.get("theme", ""),
                "segments": data.get("segments", []),
                "summary": data.get("summary", ""),
            }
        except json.JSONDecodeError:
            logger.warning("Failed to parse explore JSON, using fallback")

    return {
        "theme": "",
        "segments": [],
        "summary": text.strip()[:500] if text.strip() else "",
    }


# ---------------------------------------------------------------------------
# New pipeline prompts (Step 3)
# ---------------------------------------------------------------------------

def _format_video_info_block(video_info: dict | None) -> str:
    if not video_info:
        return "Title: Untitled video"
    lines = [f"Title: {video_info.get('title', 'Untitled video')}"]
    if video_info.get("author"):
        lines.append(f"Channel: {video_info['author']}")
    if video_info.get("description"):
        lines.append(f"Description: {video_info['description']}")
    return "\n".join(lines)


def build_summary_prompt(transcript_text: str, video_info: dict | None = None) -> str:
    """Build prompt for generating key takeaways with timestamps."""
    info_block = _format_video_info_block(video_info)
    return f"""<task>
<role>You are an expert editorial analyst distilling a video's most potent insights for time-pressed viewers.</role>
<context>
{info_block}
</context>
<goal>Produce 4-6 high-signal takeaways that help a viewer retain the video's core ideas.</goal>
<instructions>
  <item>Only use information stated explicitly in the transcript. Never speculate.</item>
  <item>Make each label specific, punchy, and no longer than 10 words.</item>
  <item>Write each insight as 1-2 sentences that preserve the speaker's framing.</item>
  <item>Attach 1-2 zero-padded timestamps (MM:SS or HH:MM:SS) that point to the supporting moments.</item>
  <item>Favor contrarian viewpoints, concrete examples, data, or memorable stories over generic advice.</item>
  <item>Avoid overlapping takeaways. Each one should stand alone.</item>
</instructions>
<qualityControl>
  <item>Verify every claim is grounded in transcript lines you can cite verbatim.</item>
  <item>Ensure timestamps map to the lines that justify the insight.</item>
  <item>If the transcript lacks enough high-quality insights, still return at least four by choosing the strongest available.</item>
</qualityControl>
<outputFormat>Return strict JSON with 4-6 objects: [{{"label":"string","insight":"string","timestamps":["MM:SS"]}}]. Do not include markdown or commentary.</outputFormat>
<transcript><![CDATA[
{transcript_text}
]]></transcript>
</task>"""


def build_suggested_questions_prompt(
    transcript_text: str,
    video_info: dict | None = None,
    topics: list[dict] | None = None,
) -> str:
    """Build prompt for generating follow-up questions."""
    info_block = _format_video_info_block(video_info)
    topics_ctx = ""
    if topics:
        topic_titles = [t.get("title", "") for t in topics if t.get("title")]
        if topic_titles:
            topics_ctx = "\nTopics covered: " + ", ".join(topic_titles)
    return f"""<task>
<role>You are a curious expert viewer who has just watched this video.</role>
<context>
{info_block}{topics_ctx}
</context>
<goal>Generate 5 thought-provoking follow-up questions a viewer might ask about this content.</goal>
<instructions>
  <item>Questions should encourage deeper exploration of the video's ideas.</item>
  <item>Mix different question types: clarification, application, comparison, prediction.</item>
  <item>Keep each question concise (one sentence).</item>
  <item>Questions should be answerable from the transcript content.</item>
</instructions>
<outputFormat>Return strict JSON: ["question1","question2","question3","question4","question5"]. No markdown or commentary.</outputFormat>
<transcript><![CDATA[
{transcript_text}
]]></transcript>
</task>"""


def parse_summary_response(text: str) -> list[dict]:
    """Parse takeaways JSON from LLM output."""
    return _parse_json_array(text)


def parse_questions_response(text: str) -> list[str]:
    """Parse suggested questions JSON array from LLM output."""
    result = _parse_json_array(text)
    return [q for q in result if isinstance(q, str)]


def _parse_json_array(text: str) -> list:
    """Extract a JSON array from LLM output."""
    text = text.strip()
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

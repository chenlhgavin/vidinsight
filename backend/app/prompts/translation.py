"""Prompt templates and parsers for batch text translation."""

from __future__ import annotations

import re


def build_translation_prompt(
    texts: list[str],
    target_language: str,
    context: str = "",
) -> list[dict]:
    """Build indexed prompt for batch translation via LLM."""
    indexed_lines = "\n".join(f"[{i + 1}] {text}" for i, text in enumerate(texts))

    context_section = ""
    if context:
        context_section = f"\nContext: {context}\n"

    system_prompt = (
        f"You are a professional translator. Translate the following numbered texts "
        f"into {target_language}.\n"
        f"{context_section}\n"
        f"Instructions:\n"
        f"- Translate each numbered item accurately and naturally.\n"
        f"- For transcript text: remove filler words (um, uh, like) and ensure natural flow.\n"
        f"- Preserve the meaning and tone of the original.\n"
        f"- Output each translation prefixed with [OUTPUT_N] where N matches the input number.\n"
        f"- Do not add any extra commentary or explanation.\n\n"
        f"Example input:\n"
        f"[1] Hello world\n"
        f"[2] How are you\n\n"
        f"Example output:\n"
        f"[OUTPUT_1] (translated text)\n"
        f"[OUTPUT_2] (translated text)"
    )

    user_message = indexed_lines

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


_OUTPUT_PATTERN = re.compile(r"\[OUTPUT_(\d+)\]\s*(.*)")


def parse_translation_response(response: str, expected_count: int) -> list[str]:
    """Extract [OUTPUT_N] entries from LLM response.

    Falls back to line splitting if regex extraction doesn't produce
    the expected count. Pads or truncates to match expected_count.
    """
    results: dict[int, str] = {}

    for line in response.strip().splitlines():
        match = _OUTPUT_PATTERN.match(line.strip())
        if match:
            index = int(match.group(1))
            text = match.group(2).strip()
            results[index] = text

    if len(results) >= expected_count:
        return [results.get(i + 1, "") for i in range(expected_count)]

    # Fallback: split by non-empty lines
    lines = [line.strip() for line in response.strip().splitlines() if line.strip()]
    # Remove any [OUTPUT_N] prefixes from fallback lines
    cleaned = []
    for line in lines:
        m = _OUTPUT_PATTERN.match(line)
        cleaned.append(m.group(2).strip() if m else line)

    # Pad or truncate to expected_count
    while len(cleaned) < expected_count:
        cleaned.append("")
    return cleaned[:expected_count]

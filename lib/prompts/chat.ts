import type { ChatMessage, Topic, TranscriptSegment, VideoInfo } from '@/lib/types';
import { buildContextHeader, transcriptToText } from './index';
import { getLanguageName } from '@/lib/language-utils';

export function buildChatSystemPrompt({
  videoInfo,
  language,
}: {
  videoInfo?: VideoInfo;
  language?: string;
}): string {
  const languageInstruction = language
    ? `\nAnswer in ${getLanguageName(language)}. Preserve citation markers like [1] exactly.`
    : '';

  return `You are an assistant for a single YouTube video. Your knowledge is STRICTLY limited to the transcript provided in the user message. If a question cannot be answered from the transcript, say so honestly.

Every factual assertion MUST cite a specific transcript moment with [n] where n is a 1-based citation index. After the answer, list the citations as JSON.
${languageInstruction}

${buildContextHeader(videoInfo, language)}

Output format (return ONLY valid JSON):
{
  "answer": "string with [1][2] markers in-place",
  "citations": [
    { "number": 1, "text": "verbatim transcript span", "timestamp": "M:SS" }
  ]
}

Rules:
- text must be a verbatim line from the transcript (or as close as possible).
- timestamp is the start time of the cited segment in M:SS or H:MM:SS.
- Do not invent citations — every [n] used in the answer must appear in citations[].`;
}

export function buildChatUserPrompt({
  transcript,
  topics,
  message,
  conversationHistory,
}: {
  transcript: TranscriptSegment[];
  topics?: Topic[];
  message: string;
  conversationHistory?: ChatMessage[];
}): string {
  const topicSection = topics?.length
    ? `\nHigh-level topics already extracted from this video:\n${topics
        .map((t, i) => `${i + 1}. ${t.title}${t.description ? ' — ' + t.description : ''}`)
        .join('\n')}\n`
    : '';
  const history = conversationHistory?.length
    ? `\nRecent conversation:\n${conversationHistory
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n')}\n`
    : '';
  return `Transcript:
${transcriptToText(transcript)}
${topicSection}${history}
Current user question:
${message}`;
}

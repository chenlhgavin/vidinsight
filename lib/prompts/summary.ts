import type { TranscriptSegment, VideoInfo } from '@/lib/types';
import { buildContextHeader, transcriptToText } from './index';

export function buildSummaryPrompt({
  transcript,
  videoInfo,
  language,
}: {
  transcript: TranscriptSegment[];
  videoInfo?: VideoInfo;
  language?: string;
}): string {
  return `You are a meticulous note-taker.

${buildContextHeader(videoInfo, language)}

Distill the transcript into 5-8 takeaways. Each takeaway has:
- label: short bold tag (≤4 words)
- insight: 1-2 sentences explaining what was actually said and why it matters
- timestamps: 1-3 references {label?, time(seconds)} pointing to the precise moments

Return ONLY a JSON object: { "takeaways": [...] }

Transcript:
${transcriptToText(transcript)}`;
}

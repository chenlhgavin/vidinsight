import type { TranscriptSegment, VideoInfo } from '@/lib/types';
import { buildContextHeader, transcriptToText } from './index';

export function buildQuotesPrompt({
  transcript,
  videoInfo,
  language,
}: {
  transcript: TranscriptSegment[];
  videoInfo?: VideoInfo;
  language?: string;
}): string {
  return `Pick up to 5 memorable verbatim lines from the transcript ("golden quotes"). Each entry:
- title: ≤12-word framing of why the quote matters
- quote: verbatim text from the transcript (do not paraphrase)
- timestamp: M:SS

Order by impact (most striking first). Return ONLY a valid JSON object: { "quotes": [...] }

${buildContextHeader(videoInfo, language)}

Transcript:
${transcriptToText(transcript)}`;
}

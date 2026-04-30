import type { Topic, TranscriptSegment, VideoInfo } from '@/lib/types';
import { buildContextHeader, transcriptToText } from './index';

export function buildQuestionsPrompt({
  transcript,
  videoInfo,
  topics,
  count = 5,
  exclude,
  language,
}: {
  transcript: TranscriptSegment[];
  videoInfo?: VideoInfo;
  topics?: Topic[];
  count?: number;
  exclude?: string[];
  language?: string;
}): string {
  const topicList = topics?.length
    ? `\nKnown topics: ${topics.map((t) => t.title).join('; ')}`
    : '';
  const ex = exclude?.length ? `\nAvoid repeating: ${exclude.join(' | ')}` : '';
  return `Generate ${count} thoughtful, specific questions a curious learner would ask after watching this video. Each question should be answerable from the transcript.${topicList}${ex}

Return ONLY a valid JSON object: { "questions": ["...", "..."] }

${buildContextHeader(videoInfo, language)}

Transcript (truncated for context):
${transcriptToText(transcript)}`;
}

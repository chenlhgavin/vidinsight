import type { TranscriptSegment, VideoInfo } from '@/lib/types';
import { buildContextHeader, transcriptToText } from './index';

export function buildTopicsPrompt({
  transcript,
  videoInfo,
  language,
  excludeTopicKeys,
  includeCandidatePool,
}: {
  transcript: TranscriptSegment[];
  videoInfo?: VideoInfo;
  language?: string;
  excludeTopicKeys?: string[];
  includeCandidatePool?: boolean;
}): string {
  const ctx = buildContextHeader(videoInfo, language);
  const tx = transcriptToText(transcript);
  const exclude = excludeTopicKeys?.length
    ? `\nDo NOT use any of the topic keys already covered: ${excludeTopicKeys.join(', ')}.`
    : '';
  const candidate = includeCandidatePool
    ? `Also generate up to 20 broader topic candidates ("topicCandidates"). Each candidate has a unique short slug "key", a "title" (≤8 words) and a representative "quote" with timestamp.`
    : 'Skip the topicCandidates field.';
  return `You are a domain expert who turns long videos into highlight reels.

${ctx}

Pick the 5 most valuable, distinct topics across the entire transcript. For each topic, return:
- id: short slug
- title: ≤8 words
- description: 1-sentence why-it-matters
- duration: total seconds across segments, as a JSON number (e.g. 90, not "1:30")
- segments: 1-3 contiguous time ranges from the transcript ({start, end, text}) where start/end are seconds as JSON numbers (e.g. 12.5), NEVER strings or "M:SS"
- keywords: 3-6 lowercase keywords
- quote: {timestamp:"M:SS", text:"verbatim line"} from the most representative segment

${candidate}${exclude}

Return ONLY a single JSON object:
{ "topics": [...], "topicCandidates": [...] }

Transcript:
${tx}`;
}

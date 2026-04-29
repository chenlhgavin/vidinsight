import type { TranscriptSegment } from '@/lib/types';

export type TranscriptFormat = 'old' | 'new';

const SAMPLE_SIZE = 100;
const SENTENCE_ENDING_REGEX = /[.!?\u3002\uff01\uff1f\u203c\u2047\u2048]\s*$/;

export function detectTranscriptFormat(segments: TranscriptSegment[]): TranscriptFormat {
  if (!segments.length) return 'new';
  const sample = segments.slice(0, SAMPLE_SIZE);
  let endsWithPunct = 0;
  let totalLen = 0;
  for (const s of sample) {
    const t = s.text?.trim() ?? '';
    if (SENTENCE_ENDING_REGEX.test(t)) endsWithPunct++;
    totalLen += t.length;
  }
  const punctRatio = endsWithPunct / sample.length;
  const avgLen = totalLen / sample.length;

  if (punctRatio < 0.15 && avgLen < 40) return 'old';
  if (punctRatio > 0.8 || avgLen > 40) return 'new';
  return punctRatio > 0.5 ? 'new' : 'old';
}

export function getTranscriptFormatStats(segments: TranscriptSegment[]) {
  if (!segments.length) {
    return {
      segmentCount: 0,
      avgTextLength: 0,
      sentenceEndingRatio: 0,
      format: 'unknown' as const,
    };
  }

  const sample = segments.slice(0, SAMPLE_SIZE);
  const totalTextLength = sample.reduce((sum, segment) => sum + (segment.text?.length ?? 0), 0);
  const sentenceEndingCount = sample.filter((segment) =>
    SENTENCE_ENDING_REGEX.test(segment.text?.trim() ?? ''),
  ).length;

  return {
    segmentCount: segments.length,
    avgTextLength: Math.round((totalTextLength / sample.length) * 10) / 10,
    sentenceEndingRatio: Math.round((sentenceEndingCount / sample.length) * 100) / 100,
    format: detectTranscriptFormat(segments),
  };
}

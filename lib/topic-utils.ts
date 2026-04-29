import type { Topic, TopicCandidate, TranscriptSegment } from '@/lib/types';
import {
  buildTranscriptIndex,
  findTextInTranscript,
  type TranscriptIndex,
} from '@/lib/quote-matcher';
import { parseTimestampRange } from '@/lib/timestamp-utils';

type TopicSegment = Topic['segments'][number];

export function topicTotalDuration(topic: Topic): number {
  return topic.segments.reduce((acc, s) => acc + (s.end - s.start), 0);
}

export function normalizeTopicQuoteText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function topicQuoteKey(topic: {
  quote?: { timestamp?: string; text?: string };
}): string | null {
  if (!topic.quote?.timestamp || !topic.quote.text) return null;
  const normalizedText = normalizeTopicQuoteText(topic.quote.text);
  if (!normalizedText) return null;
  return `${topic.quote.timestamp}|${normalizedText}`;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeSegment(segment: TopicSegment | null | undefined): TopicSegment | null {
  if (!segment) return null;
  const start = coerceNumber((segment as { start?: unknown }).start);
  const end = coerceNumber((segment as { end?: unknown }).end);
  if (start === null || end === null || end < start) return null;

  const startSegmentIdx = coerceNumber((segment as { startSegmentIdx?: unknown }).startSegmentIdx);
  const endSegmentIdx = coerceNumber((segment as { endSegmentIdx?: unknown }).endSegmentIdx);
  const startCharOffset = coerceNumber((segment as { startCharOffset?: unknown }).startCharOffset);
  const endCharOffset = coerceNumber((segment as { endCharOffset?: unknown }).endCharOffset);

  return {
    ...segment,
    start,
    end,
    startSegmentIdx: startSegmentIdx ?? undefined,
    endSegmentIdx: endSegmentIdx ?? undefined,
    startCharOffset: startCharOffset ?? undefined,
    endCharOffset: endCharOffset ?? undefined,
  };
}

function normalizeSegments(segments: TopicSegment[] | null | undefined): TopicSegment[] {
  if (!Array.isArray(segments)) return [];
  return segments.map(normalizeSegment).filter((segment): segment is TopicSegment => !!segment);
}

function normalizeTranscriptSegment(segment: TranscriptSegment | null | undefined): TranscriptSegment | null {
  if (!segment) return null;
  const start = coerceNumber((segment as { start?: unknown }).start);
  const duration = coerceNumber((segment as { duration?: unknown }).duration);
  if (start === null || duration === null) return null;

  return {
    text: typeof segment.text === 'string' ? segment.text : String(segment.text ?? ''),
    start,
    duration,
    translatedText: segment.translatedText,
  };
}

export function normalizeTranscript(
  transcript: TranscriptSegment[] | null | undefined,
): TranscriptSegment[] {
  if (!Array.isArray(transcript)) return [];
  return transcript
    .map(normalizeTranscriptSegment)
    .filter((segment): segment is TranscriptSegment => !!segment);
}

function approximateTimeOffset(segment: TranscriptSegment | undefined, charOffset: number): number {
  if (!segment?.text || !Number.isFinite(segment.duration) || segment.duration <= 0) return 0;
  const ratio = Math.max(0, Math.min(charOffset, segment.text.length)) / Math.max(1, segment.text.length);
  return segment.duration * ratio;
}

function segmentFromMatch(
  match: NonNullable<ReturnType<typeof findTextInTranscript>>,
  transcript: TranscriptSegment[],
  preferredText?: string,
): TopicSegment | null {
  const startSegment = transcript[match.startSegmentIdx];
  const endSegment = transcript[match.endSegmentIdx];
  if (!startSegment || !endSegment) return null;

  const start = startSegment.start + approximateTimeOffset(startSegment, match.startCharOffset);
  let end = endSegment.start + approximateTimeOffset(endSegment, match.endCharOffset);
  if (!Number.isFinite(end) || end <= start) {
    end = endSegment.start + endSegment.duration;
  }
  if (end <= start) {
    end = start + Math.max(5, endSegment.duration || 0);
  }

  const text = transcript
    .slice(match.startSegmentIdx, match.endSegmentIdx + 1)
    .map((segment) => segment.text)
    .join(' ')
    .trim();

  return {
    start,
    end,
    text: (preferredText || text || '').trim(),
    startSegmentIdx: match.startSegmentIdx,
    endSegmentIdx: match.endSegmentIdx,
    startCharOffset: match.startCharOffset,
    endCharOffset: match.endCharOffset,
    hasCompleteSentences: !match.matchStrategy.startsWith('fuzzy'),
    confidence: match.confidence,
  };
}

function findSegmentIndexByTime(transcript: TranscriptSegment[], time: number): number {
  if (!Number.isFinite(time)) return -1;
  for (let i = 0; i < transcript.length; i++) {
    const segment = transcript[i];
    const end = segment.start + segment.duration;
    if (time >= segment.start && (time < end || i === transcript.length - 1)) return i;
    if (time < segment.start) return Math.max(0, i - 1);
  }
  return transcript.length - 1;
}

function segmentFromTimestamp(
  timestamp: string | undefined,
  transcript: TranscriptSegment[],
  preferredText?: string,
): TopicSegment | null {
  if (!timestamp || !transcript.length) return null;
  const range = parseTimestampRange(timestamp);
  if (!range) return null;

  let startIdx = findSegmentIndexByTime(transcript, range.start);
  let endIdx = findSegmentIndexByTime(transcript, range.end);
  if (startIdx < 0) startIdx = 0;
  if (endIdx < 0) endIdx = transcript.length - 1;
  if (endIdx < startIdx) endIdx = startIdx;

  const startSegment = transcript[startIdx];
  const endSegment = transcript[endIdx];
  if (!startSegment || !endSegment) return null;

  const combinedText = transcript
    .slice(startIdx, endIdx + 1)
    .map((segment) => segment.text)
    .join(' ')
    .trim();
  const start = Math.max(startSegment.start, Math.min(range.start, startSegment.start + startSegment.duration));
  let end = Math.min(endSegment.start + endSegment.duration, Math.max(range.end, start));
  if (end <= start) end = start + Math.max(5, endSegment.duration || 0);

  return {
    start,
    end,
    text: (preferredText || combinedText || '').trim(),
    startSegmentIdx: startIdx,
    endSegmentIdx: endIdx,
    startCharOffset: 0,
    endCharOffset: endSegment.text.length,
    hasCompleteSentences: false,
    confidence: 0.5,
  };
}

function fallbackSegment(transcript: TranscriptSegment[]): TopicSegment | null {
  if (!transcript.length) return null;
  const startSegment = transcript[0];
  let endIdx = 0;
  let end = startSegment.start + startSegment.duration;

  for (let i = 0; i < transcript.length; i++) {
    endIdx = i;
    end = transcript[i].start + transcript[i].duration;
    if (end - startSegment.start >= 60) break;
  }

  return {
    start: startSegment.start,
    end,
    text: transcript
      .slice(0, endIdx + 1)
      .map((segment) => segment.text)
      .join(' ')
      .trim(),
    startSegmentIdx: 0,
    endSegmentIdx: endIdx,
    startCharOffset: 0,
    endCharOffset: transcript[endIdx].text.length,
    hasCompleteSentences: false,
    confidence: 0,
  };
}

function getTranscriptIndex(existing: TranscriptIndex | null, transcript: TranscriptSegment[]): TranscriptIndex {
  return existing ?? buildTranscriptIndex(transcript);
}

function computeDuration(segments: TopicSegment[]): number {
  return Math.round(
    segments.reduce((total, segment) => total + Math.max(0, segment.end - segment.start), 0),
  );
}

export function hydrateTopicsWithTranscript(
  topics: Topic[] | null | undefined,
  transcript: TranscriptSegment[] | null | undefined,
): Topic[] {
  if (!Array.isArray(topics)) return [];
  if (!topics.length) return topics;

  const normalizedTranscript = normalizeTranscript(transcript);
  if (!normalizedTranscript.length) {
    return topics.map((topic) => ({
      ...topic,
      segments: normalizeSegments(topic.segments),
    }));
  }

  let transcriptIndex: TranscriptIndex | null = null;

  return topics.map((topic) => {
    let hydratedSegments = normalizeSegments(topic.segments);

    if (!hydratedSegments.length) {
      const quoteText = topic.quote?.text?.trim();
      if (quoteText) {
        transcriptIndex = getTranscriptIndex(transcriptIndex, normalizedTranscript);
        const match = findTextInTranscript(normalizedTranscript, quoteText, transcriptIndex, {
          strategy: 'all',
          minSimilarity: 0.8,
          maxSegmentWindow: 20,
        });

        if (match) {
          const segment = segmentFromMatch(match, normalizedTranscript, quoteText);
          if (segment) hydratedSegments = [segment];
        }

        if (!hydratedSegments.length) {
          const range = parseTimestampRange(topic.quote?.timestamp ?? '');
          if (range) {
            const startIdx = Math.max(0, findSegmentIndexByTime(normalizedTranscript, range.start) - 2);
            const endIdx = Math.max(startIdx, findSegmentIndexByTime(normalizedTranscript, range.end));
            const rangeMatch = findTextInTranscript(normalizedTranscript, quoteText, transcriptIndex, {
              startIdx,
              strategy: 'all',
              minSimilarity: 0.75,
              maxSegmentWindow: Math.min(20, endIdx - startIdx + 5),
            });
            if (rangeMatch && rangeMatch.startSegmentIdx <= endIdx + 2) {
              const segment = segmentFromMatch(rangeMatch, normalizedTranscript, quoteText);
              if (segment) hydratedSegments = [segment];
            }
          }
        }
      }

      if (!hydratedSegments.length) {
        const segment = segmentFromTimestamp(topic.quote?.timestamp, normalizedTranscript, topic.quote?.text);
        if (segment) hydratedSegments = [segment];
      }

      if (!hydratedSegments.length) {
        const segment = fallbackSegment(normalizedTranscript);
        if (segment) hydratedSegments = [segment];
      }
    }

    return {
      ...topic,
      segments: hydratedSegments,
      duration: hydratedSegments.length ? computeDuration(hydratedSegments) : topic.duration,
    };
  });
}

export function extractThemes(candidates: TopicCandidate[] = []): string[] {
  if (!candidates.length) return [];
  const counts = new Map<string, number>();
  for (const c of candidates) {
    const words = c.title
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter((w) => w.length > 3);
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
}

export function findCandidatesForTheme(
  theme: string,
  candidates: TopicCandidate[],
): TopicCandidate[] {
  const t = theme.toLowerCase();
  return candidates.filter((c) => c.title.toLowerCase().includes(t));
}

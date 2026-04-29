import type { z } from 'zod';
import { generateAIResult, generateStructuredContent } from '@/lib/ai-client';
import {
  summaryTakeawaysSchema,
  topQuotesSchema,
  suggestedQuestionsSchema,
  quickPreviewSchema,
  chatResponseSchema,
  quoteTopicsPayloadSchema,
} from '@/lib/schemas';
import { buildSummaryPrompt } from '@/lib/prompts/summary';
import { buildQuotesPrompt } from '@/lib/prompts/quotes';
import { buildQuestionsPrompt } from '@/lib/prompts/questions';
import { buildQuickPreviewPrompt } from '@/lib/prompts/quick-preview';
import { buildChatSystemPrompt, buildChatUserPrompt } from '@/lib/prompts/chat';
import { buildTranscriptIndex, findTextInTranscript } from '@/lib/quote-matcher';
import { formatTimestamp, parseTimestampRange } from '@/lib/timestamp-utils';
import { topicQuoteKey } from '@/lib/topic-utils';
import type {
  ChatMessage,
  Topic,
  TopicCandidate,
  TopicGenerationMode,
  TopicSegment,
  TranscriptSegment,
  QuickPreview,
  VideoInfo,
} from '@/lib/types';

const AI_TIMEOUT = 60_000;
const PREVIEW_TIMEOUT = 30_000;

const TOPIC_TOTAL_BUDGET_MS = 170_000;
const TOPIC_SINGLE_PASS_TIMEOUT_MS = 90_000;
const MIN_PROVIDER_TIMEOUT_MS = 8_000;
const DEFAULT_CHUNK_DURATION_SECONDS = 5 * 60;
const DEFAULT_CHUNK_OVERLAP_SECONDS = 45;
const MAX_TOPICS = 5;
const MAX_CANDIDATES = 20;

type QuoteTopicsPayload = z.infer<typeof quoteTopicsPayloadSchema>;

type TopicGenerationStrategy = 'single-pass' | 'local-fallback';

interface CommonArgs {
  transcript: TranscriptSegment[];
  videoInfo?: VideoInfo;
  language?: string;
  signal?: AbortSignal;
}

interface QuoteTopic {
  title: string;
  quote: {
    timestamp: string;
    text: string;
  };
}

interface TranscriptChunk {
  id: string;
  start: number;
  end: number;
  segments: TranscriptSegment[];
}

interface GenerateTopicsArgs extends CommonArgs {
  excludeTopicKeys?: string[];
  includeCandidatePool?: boolean;
  mode?: TopicGenerationMode;
}

export interface GenerateTopicsResult {
  topics: Topic[];
  topicCandidates?: TopicCandidate[];
  modelUsed: string;
  modeUsed: TopicGenerationMode;
  generationStrategy: TopicGenerationStrategy;
}

function quoteKey(topic: QuoteTopic): string {
  return (
    topicQuoteKey(topic) ?? `${topic.quote.timestamp}|${topic.quote.text.trim().toLowerCase()}`
  );
}

function videoDurationSeconds(transcript: TranscriptSegment[]): number {
  const last = transcript[transcript.length - 1];
  return last ? last.start + last.duration : 0;
}

function topicModelDefault() {
  return process.env.AI_DEFAULT_MODEL || 'MiniMax-M2.7';
}

function canUseTopicProvider(): boolean {
  return Boolean(process.env.MINIMAX_API_KEY);
}

export function getTopicGenerationModel({
  mode,
  transcript,
}: {
  mode: TopicGenerationMode;
  transcript: TranscriptSegment[];
}): string {
  void mode;
  void transcript;
  return topicModelDefault();
}

function remainingBudgetMs(startedAt: number): number {
  return Math.max(0, TOPIC_TOTAL_BUDGET_MS - (Date.now() - startedAt));
}

function providerTimeout(startedAt: number, desiredMs: number, reserveMs = 10_000): number | null {
  const available = remainingBudgetMs(startedAt) - reserveMs;
  if (available < MIN_PROVIDER_TIMEOUT_MS) return null;
  return Math.min(desiredMs, available);
}

function shouldContinue(startedAt: number, signal?: AbortSignal, requiredMs = MIN_PROVIDER_TIMEOUT_MS) {
  return !signal?.aborted && remainingBudgetMs(startedAt) >= requiredMs;
}

function formatTranscriptWithTimestamps(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => {
      const start = formatTimestamp(segment.start);
      const end = formatTimestamp(segment.start + segment.duration);
      return `[${start}-${end}] ${segment.text}`;
    })
    .join('\n');
}

function formatVideoInfo(videoInfo?: VideoInfo, language?: string): string {
  const parts: string[] = [];
  if (videoInfo?.title) parts.push(`Title: ${videoInfo.title}`);
  if (videoInfo?.author) parts.push(`Channel: ${videoInfo.author}`);
  if (videoInfo?.description) parts.push(`Description: ${videoInfo.description}`);
  if (language) parts.push(`Output language: ${language}`);
  return parts.length ? parts.join('\n') : 'No video metadata provided.';
}

export function chunkTranscriptForTopics(
  segments: TranscriptSegment[],
  chunkDurationSeconds = DEFAULT_CHUNK_DURATION_SECONDS,
  overlapSeconds = DEFAULT_CHUNK_OVERLAP_SECONDS,
): TranscriptChunk[] {
  if (!segments.length) return [];

  const chunks: TranscriptChunk[] = [];
  const totalDuration = videoDurationSeconds(segments);
  const duration = Math.max(180, chunkDurationSeconds);
  const overlap = Math.min(Math.max(overlapSeconds, 0), Math.floor(duration / 2));
  const step = Math.max(60, duration - overlap);

  let windowStart = segments[0].start;
  let anchorIdx = 0;

  while (windowStart < totalDuration && anchorIdx < segments.length) {
    while (
      anchorIdx < segments.length &&
      segments[anchorIdx].start + segments[anchorIdx].duration <= windowStart
    ) {
      anchorIdx++;
    }
    if (anchorIdx >= segments.length) break;

    const chunkSegments: TranscriptSegment[] = [];
    const windowEndTarget = windowStart + duration;
    let idx = anchorIdx;
    while (idx < segments.length) {
      const segment = segments[idx];
      const segmentEnd = segment.start + segment.duration;
      if (segment.start > windowEndTarget && chunkSegments.length) break;
      chunkSegments.push(segment);
      if (segmentEnd >= windowEndTarget && chunkSegments.length) break;
      idx++;
    }

    if (!chunkSegments.length) chunkSegments.push(segments[anchorIdx]);
    const chunkStart = chunkSegments[0].start;
    const lastSegment = chunkSegments[chunkSegments.length - 1];
    const chunkEnd = lastSegment.start + lastSegment.duration;
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      start: chunkStart,
      end: chunkEnd,
      segments: chunkSegments,
    });
    windowStart = chunkStart + step;
  }

  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk && totalDuration - lastChunk.end > 5) {
    const tailStart = Math.max(segments[0].start, totalDuration - duration);
    const tailSegments = segments.filter((segment) => segment.start + segment.duration >= tailStart);
    if (tailSegments.length) {
      const tailEnd = videoDurationSeconds(tailSegments);
      if (tailEnd > lastChunk.end + 1) {
        chunks.push({
          id: `chunk-${chunks.length + 1}`,
          start: tailSegments[0].start,
          end: tailEnd,
          segments: tailSegments,
        });
      }
    }
  }

  return chunks;
}

function buildSinglePassPrompt(args: {
  transcript: TranscriptSegment[];
  videoInfo?: VideoInfo;
  language?: string;
  maxTopics: number;
}): string {
  const transcript = formatTranscriptWithTimestamps(args.transcript);
  return `You are an expert content strategist creating highlight reels from a full video transcript.

Context:
${formatVideoInfo(args.videoInfo, args.language)}

Goal:
Scan the entire transcript and choose up to ${args.maxTopics} distinct highlight reel ideas that are valuable, memorable, and distributed across the full video.

Rules:
- Return fewer than ${args.maxTopics} if only fewer moments are genuinely strong.
- Each highlight must be represented by one contiguous quote that stands alone.
- Quote text must be copied verbatim from the transcript. Do not paraphrase, summarize, stitch separate passages, or add ellipses.
- Timestamp must be an absolute bracketed range like [12:34-13:25] or [1:02:03-1:03:10].
- Titles must be concise statements, at most 10 words.
- Prefer contrarian insights, vivid stories, useful frameworks, strong examples, or data-backed arguments.

Return only this JSON object:
{ "topics": [{ "title": "string", "quote": { "timestamp": "[MM:SS-MM:SS]", "text": "exact transcript quote" } }] }

Transcript:
${transcript}`;
}

function filterExcluded<T extends QuoteTopic>(topics: T[], excludedKeys: Set<string>): T[] {
  if (!excludedKeys.size) return topics;
  return topics.filter((topic) => !excludedKeys.has(quoteKey(topic)));
}

async function runSinglePassTopicGeneration(args: {
  transcript: TranscriptSegment[];
  videoInfo?: VideoInfo;
  language?: string;
  model: string;
  startedAt: number;
  signal?: AbortSignal;
}): Promise<{ topics: QuoteTopic[]; modelUsed: string }> {
  const timeoutMs = providerTimeout(args.startedAt, TOPIC_SINGLE_PASS_TIMEOUT_MS);
  if (!timeoutMs) return { topics: [], modelUsed: args.model };

  try {
    const result = await generateAIResult<QuoteTopicsPayload>(
      buildSinglePassPrompt({
        transcript: args.transcript,
        videoInfo: args.videoInfo,
        language: args.language,
        maxTopics: MAX_TOPICS,
      }),
      {
        model: args.model,
        zodSchema: quoteTopicsPayloadSchema,
        timeoutMs,
        maxRetries: 0,
        signal: args.signal,
        temperature: 0.55,
        maxOutputTokens: 4096,
      },
    );
    return {
      topics: result.parsed?.topics ?? [],
      modelUsed: result.modelUsed,
    };
  } catch (error) {
    console.error('[generateTopics] single-pass generation failed:', error);
    return { topics: [], modelUsed: args.model };
  }
}


export function buildFallbackTopicTitle(startTime: number, endTime: number): string {
  return `Highlights from ${formatTimestamp(startTime)}-${formatTimestamp(endTime)}`;
}

export function buildFallbackQuoteTopics(
  transcript: TranscriptSegment[],
  maxTopics = MAX_TOPICS,
): QuoteTopic[] {
  if (!transcript.length) return [];
  const count = Math.max(1, Math.min(maxTopics, MAX_TOPICS));
  const chunkSize = Math.ceil(transcript.length / count);
  const topics: QuoteTopic[] = [];

  for (let i = 0; i < count && i * chunkSize < transcript.length; i++) {
    const chunk = transcript.slice(i * chunkSize, Math.min((i + 1) * chunkSize, transcript.length));
    if (!chunk.length) continue;
    const start = chunk[0].start;
    const endSegment = chunk[chunk.length - 1];
    const end = endSegment.start + endSegment.duration;
    topics.push({
      title: buildFallbackTopicTitle(start, end),
      quote: {
        timestamp: `[${formatTimestamp(start)}-${formatTimestamp(end)}]`,
        text: chunk
          .map((segment) => segment.text)
          .join(' ')
          .slice(0, 500),
      },
    });
  }

  return topics;
}

interface TranscriptTextMatch {
  startSegmentIdx: number;
  endSegmentIdx: number;
  startCharOffset: number;
  endCharOffset: number;
  matchStrategy: string;
  confidence: number;
}

function approximateTimeOffset(segment: TranscriptSegment | undefined, charOffset: number): number {
  if (!segment?.text || !Number.isFinite(segment.duration) || segment.duration <= 0) return 0;
  const safeLength = Math.max(1, segment.text.length);
  const ratio = Math.max(0, Math.min(charOffset, safeLength)) / safeLength;
  return segment.duration * ratio;
}

function segmentFromMatch(
  transcript: TranscriptSegment[],
  match: TranscriptTextMatch,
  preferredText: string,
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
    text: text || preferredText,
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
  transcript: TranscriptSegment[],
  timestamp: string,
  preferredText: string,
): TopicSegment | null {
  const range = parseTimestampRange(timestamp);
  if (!range || !transcript.length) return null;

  let startIdx = findSegmentIndexByTime(transcript, range.start);
  let endIdx = findSegmentIndexByTime(transcript, range.end);
  if (startIdx < 0) startIdx = 0;
  if (endIdx < 0) endIdx = transcript.length - 1;
  if (endIdx < startIdx) endIdx = startIdx;

  const startSegment = transcript[startIdx];
  const endSegment = transcript[endIdx];
  if (!startSegment || !endSegment) return null;

  const text = transcript
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
    text: text || preferredText,
    startSegmentIdx: startIdx,
    endSegmentIdx: endIdx,
    startCharOffset: 0,
    endCharOffset: endSegment.text.length,
    hasCompleteSentences: false,
    confidence: 0.5,
  };
}

function fallbackSegment(transcript: TranscriptSegment[], preferredText: string): TopicSegment | null {
  if (!transcript.length) return null;
  const startSegment = transcript[0];
  let endIdx = 0;
  let end = startSegment.start + startSegment.duration;
  for (let i = 0; i < transcript.length; i++) {
    endIdx = i;
    end = transcript[i].start + transcript[i].duration;
    if (end - startSegment.start >= 60) break;
  }

  const text = transcript
    .slice(0, endIdx + 1)
    .map((segment) => segment.text)
    .join(' ')
    .trim();
  return {
    start: startSegment.start,
    end,
    text: text || preferredText,
    startSegmentIdx: 0,
    endSegmentIdx: endIdx,
    startCharOffset: 0,
    endCharOffset: transcript[endIdx].text.length,
    hasCompleteSentences: false,
    confidence: 0,
  };
}

export function hydrateQuoteTopics(
  quoteTopics: QuoteTopic[],
  transcript: TranscriptSegment[],
): Topic[] {
  if (!quoteTopics.length) return [];
  const index = buildTranscriptIndex(transcript);
  const hydrated = quoteTopics
    .map((topic) => {
      const quoteText = topic.quote.text.trim();
      const match = quoteText
        ? findTextInTranscript(transcript, quoteText, index, {
            strategy: 'all',
            minSimilarity: 0.8,
            maxSegmentWindow: 20,
          })
        : null;
      let matchedSegment = match ? segmentFromMatch(transcript, match, quoteText) : null;

      if (!matchedSegment && quoteText) {
        const range = parseTimestampRange(topic.quote.timestamp);
        if (range) {
          const startIdx = Math.max(0, findSegmentIndexByTime(transcript, range.start) - 2);
          const endIdx = Math.max(startIdx, findSegmentIndexByTime(transcript, range.end));
          const rangeMatch = findTextInTranscript(transcript, quoteText, index, {
            startIdx,
            strategy: 'all',
            minSimilarity: 0.75,
            maxSegmentWindow: Math.min(20, endIdx - startIdx + 5),
          });
          if (rangeMatch && rangeMatch.startSegmentIdx <= endIdx + 2) {
            matchedSegment = segmentFromMatch(transcript, rangeMatch, quoteText);
          }
        }
      }

      const resolvedSegment =
        matchedSegment ??
        segmentFromTimestamp(transcript, topic.quote.timestamp, quoteText) ??
        fallbackSegment(transcript, quoteText);
      const segments = resolvedSegment ? [resolvedSegment] : [];
      const duration = Math.round(
        segments.reduce((total, item) => total + Math.max(0, item.end - item.start), 0),
      );
      return {
        title: topic.title,
        duration,
        segments,
        quote: topic.quote,
      };
    })
    .filter((topic) => topic.segments.length > 0)
    .sort((a, b) => a.segments[0].start - b.segments[0].start);

  return hydrated.map((topic, index) => ({
    id: `topic-${index}`,
    title: topic.title,
    duration: topic.duration,
    segments: topic.segments,
    quote: topic.quote,
  }));
}

function buildTopicCandidates(
  topics: QuoteTopic[],
  candidates: QuoteTopic[],
  excludedKeys: Set<string>,
): TopicCandidate[] {
  const map = new Map<string, TopicCandidate>();
  for (const source of [...candidates, ...topics]) {
    const key = quoteKey(source);
    if (map.has(key) || excludedKeys.has(key)) continue;
    map.set(key, {
      key,
      title: source.title,
      quote: source.quote,
    });
  }
  return [...map.values()].slice(0, MAX_CANDIDATES);
}

export async function generateTopics(args: GenerateTopicsArgs): Promise<GenerateTopicsResult> {
  const startedAt = Date.now();
  const mode: TopicGenerationMode = 'smart';
  const includeCandidatePool = args.includeCandidatePool ?? true;
  const excludedKeys = new Set(args.excludeTopicKeys ?? []);
  const smartModel = getTopicGenerationModel({ mode: 'smart', transcript: args.transcript });

  let quoteTopics: QuoteTopic[] = [];
  const candidateTopics: QuoteTopic[] = [];
  let modelUsed = smartModel;
  let generationStrategy: TopicGenerationStrategy = 'local-fallback';

  const canUseAI = canUseTopicProvider();

  if (canUseAI && mode === 'smart' && shouldContinue(startedAt, args.signal)) {
    const singlePass = await runSinglePassTopicGeneration({
      transcript: args.transcript,
      videoInfo: args.videoInfo,
      language: args.language,
      model: smartModel,
      startedAt,
      signal: args.signal,
    });
    quoteTopics = filterExcluded(singlePass.topics, excludedKeys).slice(0, MAX_TOPICS);
    modelUsed = singlePass.modelUsed || smartModel;
    if (quoteTopics.length) generationStrategy = 'single-pass';
  }

  if (!quoteTopics.length) {
    quoteTopics = filterExcluded(buildFallbackQuoteTopics(args.transcript, MAX_TOPICS), excludedKeys);
    modelUsed ||= smartModel;
    generationStrategy = 'local-fallback';
  }

  const topics = hydrateQuoteTopics(quoteTopics.slice(0, MAX_TOPICS), args.transcript);
  return {
    topics,
    topicCandidates: includeCandidatePool
      ? buildTopicCandidates(quoteTopics, candidateTopics, excludedKeys)
      : undefined,
    modelUsed,
    modeUsed: mode,
    generationStrategy,
  };
}

export async function generateSummary(args: CommonArgs) {
  const prompt = buildSummaryPrompt(args);
  return generateStructuredContent(prompt, summaryTakeawaysSchema, {
    timeoutMs: AI_TIMEOUT,
    signal: args.signal,
    temperature: 0.4,
  });
}

export async function generateQuotes(args: CommonArgs) {
  const prompt = buildQuotesPrompt(args);
  return generateStructuredContent(prompt, topQuotesSchema, {
    timeoutMs: AI_TIMEOUT,
    signal: args.signal,
    temperature: 0.4,
  });
}

export async function generateQuestions(
  args: CommonArgs & { topics?: Topic[]; count?: number; exclude?: string[] },
) {
  const prompt = buildQuestionsPrompt(args);
  return generateStructuredContent(prompt, suggestedQuestionsSchema, {
    timeoutMs: AI_TIMEOUT,
    signal: args.signal,
    temperature: 0.6,
  });
}

function quickPreviewExcerpt(segments: TranscriptSegment[], maxSeconds = 30, maxWords = 500): string {
  if (!segments.length) return '';
  const baseStart = segments[0].start;
  const parts: string[] = [];
  let wordsUsed = 0;

  for (const segment of segments) {
    const relativeStart = Math.max(0, segment.start - baseStart);
    if (relativeStart > maxSeconds && parts.length > 0) break;

    const words = segment.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    const remaining = maxWords - wordsUsed;
    if (remaining <= 0) break;
    parts.push(words.slice(0, remaining).join(' '));
    wordsUsed += Math.min(words.length, remaining);
    if (wordsUsed >= maxWords) break;
  }

  return parts.join(' ').trim();
}

function concisePreviewTitle(title?: string): string {
  const trimmed = title?.trim();
  if (!trimmed) return 'Quick preview';
  return trimmed.split(/\s+/).slice(0, 8).join(' ');
}

function quickPreviewFallback(videoInfo?: VideoInfo): QuickPreview {
  const title = videoInfo?.title?.trim();
  const author = videoInfo?.author?.trim();
  const description = videoInfo?.description?.trim();
  const previewTitle = concisePreviewTitle(title);
  const glance = [
    'Standout moments are being mapped',
    'Key takeaways are being prepared',
    'Follow-up questions will be suggested',
  ];

  if (description) {
    const excerpt = description.split(/\s+/).slice(0, 42).join(' ');
    return {
      title: previewTitle,
      summary: `${excerpt}${excerpt.endsWith('.') ? '' : '...'}`,
      glance,
    };
  }

  if (title && author) {
    return {
      title: previewTitle,
      summary: `${author} explores "${title}". Highlights and takeaways are being prepared from the transcript.`,
      glance,
    };
  }

  if (title) {
    return {
      title: previewTitle,
      summary: `Analyzing "${title}" to surface the standout moments, takeaways, and follow-up questions.`,
      glance,
    };
  }

  return {
    title: previewTitle,
    summary:
      'Analyzing this video to surface the main ideas, memorable moments, and transcript-grounded study material.',
    glance,
  };
}

function normalizeQuickPreviewResult(preview: QuickPreview, fallback: QuickPreview): QuickPreview {
  const title = preview.title.trim() || fallback.title;
  const summary = preview.summary.trim() || fallback.summary;
  const glance = preview.glance.map((item) => item.trim()).filter(Boolean).slice(0, 5);
  return {
    title,
    summary,
    glance: glance.length ? glance : fallback.glance,
  };
}

export async function generateQuickPreview(args: CommonArgs): Promise<{ preview: QuickPreview }> {
  const fallback = quickPreviewFallback(args.videoInfo);
  const transcriptExcerpt = quickPreviewExcerpt(args.transcript);
  if (!transcriptExcerpt) return { preview: fallback };

  try {
    const prompt = buildQuickPreviewPrompt({
      transcriptExcerpt,
      videoInfo: args.videoInfo,
      language: args.language,
    });
    const result = await generateStructuredContent(prompt, quickPreviewSchema, {
      timeoutMs: PREVIEW_TIMEOUT,
      signal: args.signal,
      temperature: 0.7,
    });
    return { preview: normalizeQuickPreviewResult(result.preview, fallback) };
  } catch (error) {
    console.error('[quickPreview] falling back:', error);
    return { preview: fallback };
  }
}

export async function generateChat(args: {
  transcript: TranscriptSegment[];
  topics?: Topic[];
  message: string;
  conversationHistory?: ChatMessage[];
  videoInfo?: VideoInfo;
  language?: string;
  signal?: AbortSignal;
}) {
  const systemPrompt = buildChatSystemPrompt({
    videoInfo: args.videoInfo,
    language: args.language,
  });
  const prompt = buildChatUserPrompt({
    transcript: args.transcript,
    topics: args.topics,
    message: args.message,
    conversationHistory: args.conversationHistory,
  });
  return generateStructuredContent(prompt, chatResponseSchema, {
    systemPrompt,
    timeoutMs: AI_TIMEOUT,
    signal: args.signal,
    temperature: 0.3,
  });
}

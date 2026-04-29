import type { TranscriptSegment } from '@/lib/types';
import { detectTranscriptFormat } from '@/lib/transcript-format-detector';

const MAX_SENTENCE_DURATION_SECONDS = 24;
const MAX_SENTENCE_WORDS = 80;
const MAX_SEGMENTS_PER_SENTENCE = 20;

const COMMON_TLDS = [
  'com',
  'org',
  'net',
  'edu',
  'gov',
  'co',
  'io',
  'ai',
  'dev',
  'txt',
  'pdf',
  'jpg',
  'png',
  'gif',
  'doc',
  'zip',
  'html',
  'js',
  'ts',
];
const COMMON_ABBREVS = ['dr', 'mr', 'mrs', 'ms', 'vs', 'etc', 'inc', 'ltd', 'jr', 'sr'];

const WHITESPACE_GLOBAL_REGEX = /\s+/g;
const PUNCTUATION_OR_SPACE_REGEX = /[\s,;!?]/;
const DIGIT_REGEX = /\d/;
const NON_PERIOD_SENTENCE_ENDING_REGEX = /[!?\u3002\uff01\uff1f\u203c\u2047\u2048]$/;

export interface MergedSentence {
  text: string;
  startIndex: number;
  endIndex: number;
  segments: TranscriptSegment[];
}

function countWords(text: string): number {
  if (!text) return 0;
  let count = 0;
  let inWord = false;

  for (const char of text) {
    if (/\s/.test(char)) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count++;
    }
  }

  return count;
}

function segmentEnd(segment: TranscriptSegment | undefined): number {
  if (!segment) return 0;
  return segment.start + Math.max(0, segment.duration || 0);
}

function splitLongSentence(sentence: MergedSentence): MergedSentence[] {
  const firstSegment = sentence.segments[0];
  const lastSegment = sentence.segments[sentence.segments.length - 1];
  const duration = firstSegment && lastSegment ? segmentEnd(lastSegment) - firstSegment.start : 0;
  if (
    duration <= MAX_SENTENCE_DURATION_SECONDS &&
    countWords(sentence.text) <= MAX_SENTENCE_WORDS &&
    sentence.segments.length <= MAX_SEGMENTS_PER_SENTENCE
  ) {
    return [sentence];
  }

  const chunks: MergedSentence[] = [];
  let chunkSegments: TranscriptSegment[] = [];
  let chunkWordCount = 0;
  let chunkStartIndex = sentence.startIndex;

  const pushChunk = (endIndex: number) => {
    if (!chunkSegments.length) return;
    chunks.push({
      text: chunkSegments
        .map((segment) => segment.text)
        .join(' ')
        .replace(WHITESPACE_GLOBAL_REGEX, ' ')
        .trim(),
      startIndex: chunkStartIndex,
      endIndex,
      segments: [...chunkSegments],
    });
  };

  sentence.segments.forEach((segment, idx) => {
    const segmentWords = countWords(segment.text || '');
    const nextSegments = [...chunkSegments, segment];
    const first = nextSegments[0];
    const nextDuration = Math.max(0, segmentEnd(nextSegments[nextSegments.length - 1]) - first.start);
    const nextWords = chunkWordCount + segmentWords;
    const nextSegmentCount = nextSegments.length;

    const exceedsDuration =
      chunkSegments.length > 0 && nextDuration > MAX_SENTENCE_DURATION_SECONDS;
    const exceedsWords = chunkSegments.length > 0 && nextWords > MAX_SENTENCE_WORDS;
    const exceedsSegments =
      chunkSegments.length > 0 && nextSegmentCount > MAX_SEGMENTS_PER_SENTENCE;

    if (exceedsDuration || exceedsWords || exceedsSegments) {
      const endIndex = chunkStartIndex + chunkSegments.length - 1;
      pushChunk(endIndex);
      chunkSegments = [];
      chunkWordCount = 0;
      chunkStartIndex = sentence.startIndex + idx;
    }

    chunkSegments.push(segment);
    chunkWordCount += segmentWords;
  });

  pushChunk(chunkStartIndex + chunkSegments.length - 1);
  return chunks;
}

function isSentenceEndingPeriod(text: string, periodIndex: number): boolean {
  const before = text.charAt(periodIndex - 1);
  const after = text.charAt(periodIndex + 1);

  if (DIGIT_REGEX.test(before) && DIGIT_REGEX.test(after)) {
    return false;
  }

  const afterPeriod = text.slice(periodIndex + 1, periodIndex + 5).toLowerCase();
  for (const pattern of COMMON_TLDS) {
    if (!afterPeriod.startsWith(pattern)) continue;
    const charAfterPattern = text.charAt(periodIndex + 1 + pattern.length);
    if (!charAfterPattern || PUNCTUATION_OR_SPACE_REGEX.test(charAfterPattern)) {
      return false;
    }
  }

  const beforePeriod = text.slice(Math.max(0, periodIndex - 3), periodIndex).toLowerCase();
  for (const abbrev of COMMON_ABBREVS) {
    if (beforePeriod.endsWith(abbrev)) {
      return false;
    }
  }

  return true;
}

function endsWithSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (NON_PERIOD_SENTENCE_ENDING_REGEX.test(trimmed)) {
    return true;
  }

  if (trimmed.endsWith('.')) {
    return isSentenceEndingPeriod(trimmed, trimmed.length - 1);
  }

  return false;
}

function findEarlyPunctuation(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return -1;

  let firstPunctuation: number | undefined;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (!/[.!?\u3002\uff01\uff1f\u203c\u2047\u2048]/.test(char)) continue;
    if (char === '.' && !isSentenceEndingPeriod(trimmed, i)) continue;
    firstPunctuation = i;
    break;
  }
  if (firstPunctuation === undefined) return -1;

  const wordsBefore = countWords(trimmed.slice(0, firstPunctuation).trim());
  return wordsBefore <= 2 ? firstPunctuation + 1 : -1;
}

function findLatePunctuation(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return -1;

  let lastPunctuation: number | undefined;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const char = trimmed[i];
    if (!/[.!?\u3002\uff01\uff1f\u203c\u2047\u2048]/.test(char)) continue;
    if (char === '.' && !isSentenceEndingPeriod(trimmed, i)) continue;
    lastPunctuation = i;
    break;
  }
  if (lastPunctuation === undefined) return -1;

  const wordsAfter = countWords(trimmed.slice(lastPunctuation + 1).trim());
  return wordsAfter >= 1 && wordsAfter <= 2 ? lastPunctuation + 1 : -1;
}

export function mergeTranscriptSegmentsIntoSentences(
  segments: TranscriptSegment[],
): MergedSentence[] {
  if (!segments.length) return [];

  const merged: MergedSentence[] = [];
  let currentSentence: string[] = [];
  let currentSegments: TranscriptSegment[] = [];
  let startIndex = 0;
  let carryoverText = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    let text = segment.text || '';

    if (carryoverText) {
      text = `${carryoverText} ${text}`;
      carryoverText = '';
    }

    if (!text.trim()) {
      if (currentSentence.length > 0) currentSegments.push(segment);
      continue;
    }

    const earlySplitPos = findEarlyPunctuation(text);
    if (earlySplitPos > 0 && currentSentence.length > 0) {
      const beforeEarlyPunctuation = text.slice(0, earlySplitPos).trim();
      const afterEarlyPunctuation = text.slice(earlySplitPos).trim();

      if (beforeEarlyPunctuation) currentSentence.push(beforeEarlyPunctuation);
      currentSegments.push(segment);
      merged.push({
        text: currentSentence.join(' ').replace(WHITESPACE_GLOBAL_REGEX, ' ').trim(),
        startIndex,
        endIndex: i,
        segments: [...currentSegments],
      });

      currentSentence = [];
      currentSegments = [];

      if (!afterEarlyPunctuation) continue;
      text = afterEarlyPunctuation;
    }

    const lateSplitPos = findLatePunctuation(text);
    if (lateSplitPos > 0) {
      const beforePunctuation = text.slice(0, lateSplitPos).trim();
      const afterPunctuation = text.slice(lateSplitPos).trim();

      if (currentSentence.length === 0) startIndex = i;
      if (beforePunctuation) currentSentence.push(beforePunctuation);
      currentSegments.push(segment);

      merged.push({
        text: currentSentence.join(' ').replace(WHITESPACE_GLOBAL_REGEX, ' ').trim(),
        startIndex,
        endIndex: i,
        segments: [...currentSegments],
      });

      currentSentence = [];
      currentSegments = [];
      if (afterPunctuation) carryoverText = afterPunctuation;
      continue;
    }

    if (currentSentence.length === 0) startIndex = i;
    currentSentence.push(text);
    currentSegments.push(segment);

    if (endsWithSentence(text)) {
      merged.push({
        text: currentSentence.join(' ').replace(WHITESPACE_GLOBAL_REGEX, ' ').trim(),
        startIndex,
        endIndex: i,
        segments: [...currentSegments],
      });

      currentSentence = [];
      currentSegments = [];
    }
  }

  if (currentSentence.length > 0) {
    merged.push({
      text: currentSentence.join(' ').replace(WHITESPACE_GLOBAL_REGEX, ' ').trim(),
      startIndex,
      endIndex: segments.length - 1,
      segments: [...currentSegments],
    });
  }

  if (carryoverText.trim()) {
    merged.push({
      text: carryoverText.trim(),
      startIndex: segments.length - 1,
      endIndex: segments.length - 1,
      segments: [segments[segments.length - 1]],
    });
  }

  return merged.flatMap(splitLongSentence);
}

function sentenceToSegment(sentence: MergedSentence): TranscriptSegment {
  const first = sentence.segments[0];
  const last = sentence.segments[sentence.segments.length - 1];
  return {
    text: sentence.text,
    start: first?.start ?? 0,
    duration: Math.max(0, segmentEnd(last) - (first?.start ?? 0)),
  };
}

export function mergeSegmentsIntoSentences(input: TranscriptSegment[]): TranscriptSegment[] {
  return mergeTranscriptSegmentsIntoSentences(input).map(sentenceToSegment);
}

export function ensureMergedFormat(
  segments: TranscriptSegment[],
  options?: { enableLogging?: boolean; context?: string },
): TranscriptSegment[] {
  if (!segments.length) return segments;
  const format = detectTranscriptFormat(segments);
  if (format === 'new') {
    if (options?.enableLogging) {
      console.log(
        `[Transcript Format] Transcript already merged${options.context ? ` for ${options.context}` : ''}.`,
      );
    }
    return segments;
  }

  if (options?.enableLogging) {
    console.log(
      `[Transcript Format] Detected fragmented transcript${options.context ? ` for ${options.context}` : ''}.`,
    );
  }

  return mergeSegmentsIntoSentences(segments);
}

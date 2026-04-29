import type { TranscriptSegment } from '@/lib/types';

const FUZZY_THRESHOLD = 0.5;
const N_GRAM_SIZE = 3;

export interface MatchResult {
  startSegmentIdx: number;
  endSegmentIdx: number;
  startCharOffset: number;
  endCharOffset: number;
  matchStrategy: 'exact' | 'normalized' | 'fuzzy';
  similarity?: number;
  confidence: number;
}

export interface TextMatchResult {
  found: true;
  startSegmentIdx: number;
  endSegmentIdx: number;
  startCharOffset: number;
  endCharOffset: number;
  matchStrategy: 'exact' | 'normalized' | 'fuzzy-ngram';
  similarity: number;
  confidence: number;
}

export interface SegmentBoundary {
  segmentIdx: number;
  startPos: number;
  endPos: number;
  text: string;
  normalizedText: string;
  normalizedStartPos: number;
  normalizedEndPos: number;
  normalizedCharToOriginalStart: number[];
  normalizedCharToOriginalEnd: number[];
}

export interface TranscriptIndex {
  fullText: string;
  fullTextSpace: string;
  fullTextNewline: string;
  normalizedText: string;
  boundaries: SegmentBoundary[];
  segmentBoundaries: SegmentBoundary[];
  wordIndex: Map<string, number[]>;
  ngramIndex: Map<string, Set<number>>;
}

interface NormalizedWithMap {
  text: string;
  startOffsets: number[];
  endOffsets: number[];
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isNormalizedChar(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

function normalizeWithMap(text: string): NormalizedWithMap {
  const out: string[] = [];
  const startOffsets: number[] = [];
  const endOffsets: number[] = [];
  let pendingSpace: { start: number; end: number } | null = null;

  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i);
    const raw = codePoint === undefined ? text[i] : String.fromCodePoint(codePoint);
    const width = raw.length;
    const lower = raw.toLowerCase();

    if (isNormalizedChar(lower)) {
      if (pendingSpace && out.length > 0 && out[out.length - 1] !== ' ') {
        out.push(' ');
        startOffsets.push(pendingSpace.start);
        endOffsets.push(pendingSpace.end);
      }

      for (const char of lower) {
        if (!isNormalizedChar(char)) continue;
        out.push(char);
        startOffsets.push(i);
        endOffsets.push(i + width);
      }
      pendingSpace = null;
    } else if (out.length > 0) {
      pendingSpace ??= { start: i, end: i + width };
    }

    i += width;
  }

  return { text: out.join(''), startOffsets, endOffsets };
}

export function normalizeForMatching(text: string): string {
  return normalizeWithMap(text).text;
}

function createNgrams(text: string, n = N_GRAM_SIZE): Set<string> {
  const clean = text.replace(/\s+/g, '');
  const grams = new Set<string>();
  for (let i = 0; i <= clean.length - n; i++) {
    grams.add(clean.slice(i, i + n));
  }
  return grams;
}

function* segmentNgrams(text: string, n = N_GRAM_SIZE): Generator<string> {
  yield* createNgrams(text, n);
}

export function calculateNgramSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const clean1 = normalizeForMatching(str1).replace(/\s+/g, '');
  const clean2 = normalizeForMatching(str2).replace(/\s+/g, '');
  if (!clean1 || !clean2) return 0;

  const grams1 = createNgrams(clean1);
  const grams2 = createNgrams(clean2);
  if (!grams1.size || !grams2.size) {
    return clean1.includes(clean2) || clean2.includes(clean1) ? 0.8 : 0;
  }

  let intersection = 0;
  for (const gram of grams1) {
    if (grams2.has(gram)) intersection++;
  }

  return intersection / (grams1.size + grams2.size - intersection);
}

function calculateTokenContainmentSimilarity(str1: string, str2: string): number {
  const words1 = normalizeForMatching(str1).split(' ').filter((word) => word.length >= 2);
  const words2 = new Set(normalizeForMatching(str2).split(' ').filter((word) => word.length >= 2));
  if (!words1.length || !words2.size) return 0;

  let matches = 0;
  for (const word of words1) {
    if (words2.has(word)) matches++;
  }
  const recall = matches / words1.length;
  const precision = matches / words2.size;
  if (recall === 0 || precision === 0) return 0;
  return (2 * recall * precision) / (recall + precision);
}

export function boyerMooreSearch(text: string, pattern: string): number {
  if (pattern.length === 0) return 0;
  if (pattern.length > text.length) return -1;

  const badChar = new Map<string, number>();
  for (let i = 0; i < pattern.length - 1; i++) {
    badChar.set(pattern[i], pattern.length - 1 - i);
  }

  let i = pattern.length - 1;
  while (i < text.length) {
    let j = pattern.length - 1;
    let k = i;
    while (j >= 0 && k >= 0 && text[k] === pattern[j]) {
      if (j === 0) return k;
      j--;
      k--;
    }
    i += badChar.get(text[i]) ?? pattern.length;
  }

  return -1;
}

export function buildTranscriptIndex(segments: TranscriptSegment[]): TranscriptIndex {
  const boundaries: SegmentBoundary[] = [];
  const fullParts: string[] = [];
  const normParts: string[] = [];
  const wordIndex = new Map<string, number[]>();
  const ngramIndex = new Map<string, Set<number>>();

  let pos = 0;
  let normPos = 0;
  for (let i = 0; i < segments.length; i++) {
    const text = segments[i]?.text ?? '';
    const normalized = normalizeWithMap(text);
    const startPos = pos;
    const endPos = pos + text.length;
    const normalizedStartPos = normPos;
    const normalizedEndPos = normPos + normalized.text.length;

    const boundary: SegmentBoundary = {
      segmentIdx: i,
      startPos,
      endPos,
      text,
      normalizedText: normalized.text,
      normalizedStartPos,
      normalizedEndPos,
      normalizedCharToOriginalStart: normalized.startOffsets,
      normalizedCharToOriginalEnd: normalized.endOffsets,
    };
    boundaries.push(boundary);

    fullParts.push(text);
    normParts.push(normalized.text);
    pos = endPos + 1;
    normPos = normalizedEndPos + 1;

    for (const word of normalized.text.split(' ')) {
      if (word.length < 2) continue;
      const existing = wordIndex.get(word);
      if (existing) existing.push(i);
      else wordIndex.set(word, [i]);
    }

    for (const gram of segmentNgrams(normalized.text)) {
      let set = ngramIndex.get(gram);
      if (!set) {
        set = new Set();
        ngramIndex.set(gram, set);
      }
      set.add(i);
    }
  }

  const fullTextSpace = fullParts.join(' ');
  const fullTextNewline = fullParts.join('\n');
  const normalizedText = normParts.join(' ');

  return {
    fullText: fullTextSpace,
    fullTextSpace,
    fullTextNewline,
    normalizedText,
    boundaries,
    segmentBoundaries: boundaries,
    wordIndex,
    ngramIndex,
  };
}

export function mapMatchToSegments(
  matchStart: number,
  matchLength: number,
  index: TranscriptIndex,
): Omit<TextMatchResult, 'matchStrategy' | 'similarity' | 'confidence'> | null {
  const matchEnd = matchStart + matchLength;
  let startSegmentIdx = -1;
  let endSegmentIdx = -1;
  let startCharOffset = 0;
  let endCharOffset = 0;

  for (const boundary of index.segmentBoundaries) {
    if (
      startSegmentIdx === -1 &&
      matchStart >= boundary.startPos &&
      matchStart < boundary.endPos
    ) {
      startSegmentIdx = boundary.segmentIdx;
      startCharOffset = matchStart - boundary.startPos;
    }

    if (matchEnd > boundary.startPos && matchEnd <= boundary.endPos) {
      endSegmentIdx = boundary.segmentIdx;
      endCharOffset = matchEnd - boundary.startPos;
      break;
    }

    if (matchEnd > boundary.endPos && matchStart <= boundary.endPos) {
      endSegmentIdx = boundary.segmentIdx;
      endCharOffset = boundary.text.length;
    }
  }

  if (startSegmentIdx === -1 && matchStart === 0 && index.segmentBoundaries[0]?.text.length === 0) {
    startSegmentIdx = 0;
  }
  if (startSegmentIdx !== -1 && endSegmentIdx === -1) {
    endSegmentIdx = startSegmentIdx;
    endCharOffset = index.segmentBoundaries[endSegmentIdx]?.text.length ?? 0;
  }
  if (startSegmentIdx === -1 || endSegmentIdx === -1) return null;

  return {
    found: true,
    startSegmentIdx,
    endSegmentIdx,
    startCharOffset,
    endCharOffset,
  };
}

function findNormalizedBoundary(
  index: TranscriptIndex,
  position: number,
  preferPrevious: boolean,
): SegmentBoundary | null {
  for (const boundary of index.segmentBoundaries) {
    if (position >= boundary.normalizedStartPos && position < boundary.normalizedEndPos) {
      return boundary;
    }
    if (preferPrevious && position === boundary.normalizedEndPos) {
      return boundary;
    }
  }
  return null;
}

function normalizedStartOffset(boundary: SegmentBoundary, globalPosition: number): number {
  const rel = Math.max(0, globalPosition - boundary.normalizedStartPos);
  if (rel >= boundary.normalizedText.length) return boundary.text.length;
  return boundary.normalizedCharToOriginalStart[rel] ?? 0;
}

function normalizedEndOffset(boundary: SegmentBoundary, globalPosition: number): number {
  const rel = Math.max(0, globalPosition - boundary.normalizedStartPos);
  if (rel <= 0) return 0;
  if (rel >= boundary.normalizedText.length) return boundary.text.length;
  return boundary.normalizedCharToOriginalEnd[rel - 1] ?? boundary.text.length;
}

export function mapNormalizedMatchToSegments(
  normalizedMatchIdx: number,
  normalizedTargetText: string,
  index: TranscriptIndex,
): Omit<TextMatchResult, 'matchStrategy' | 'similarity' | 'confidence'> | null {
  const matchEnd = normalizedMatchIdx + normalizedTargetText.length;
  const startBoundary = findNormalizedBoundary(index, normalizedMatchIdx, false);
  const endBoundary = findNormalizedBoundary(index, matchEnd, true);
  if (!startBoundary || !endBoundary) return null;

  return {
    found: true,
    startSegmentIdx: startBoundary.segmentIdx,
    endSegmentIdx: Math.max(startBoundary.segmentIdx, endBoundary.segmentIdx),
    startCharOffset: normalizedStartOffset(startBoundary, normalizedMatchIdx),
    endCharOffset: normalizedEndOffset(endBoundary, matchEnd),
  };
}

function scoreCandidateSegments(
  index: TranscriptIndex,
  normalizedTarget: string,
  startIdx: number,
): number[] {
  const scores = new Map<number, number>();
  const words = normalizedTarget.split(' ').filter((word) => word.length >= 2);

  for (const word of words) {
    const segmentIndices = index.wordIndex.get(word) ?? [];
    for (const idx of segmentIndices) {
      if (idx >= startIdx) scores.set(idx, (scores.get(idx) ?? 0) + 2);
    }
  }

  for (const gram of segmentNgrams(normalizedTarget)) {
    const segmentIndices = index.ngramIndex.get(gram);
    if (!segmentIndices) continue;
    for (const idx of segmentIndices) {
      if (idx >= startIdx) scores.set(idx, (scores.get(idx) ?? 0) + 1);
    }
  }

  if (!scores.size && index.segmentBoundaries.length <= 200) {
    for (let i = startIdx; i < index.segmentBoundaries.length; i++) {
      scores.set(i, 1);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 30)
    .map(([idx]) => idx);
}

export function findTextInTranscript(
  transcript: TranscriptSegment[],
  targetText: string,
  index: TranscriptIndex,
  options: {
    startIdx?: number;
    strategy?: 'exact' | 'normalized' | 'fuzzy' | 'all';
    minSimilarity?: number;
    maxSegmentWindow?: number;
  } = {},
): TextMatchResult | null {
  const {
    startIdx = 0,
    strategy = 'all',
    minSimilarity = FUZZY_THRESHOLD,
    maxSegmentWindow = 30,
  } = options;

  if (!targetText?.trim() || !transcript.length || !index.segmentBoundaries.length) return null;

  if (strategy === 'exact' || strategy === 'all') {
    const exactMatch = boyerMooreSearch(index.fullTextSpace, targetText);
    if (exactMatch !== -1) {
      const result = mapMatchToSegments(exactMatch, targetText.length, index);
      if (result && result.startSegmentIdx >= startIdx) {
        return {
          ...result,
          matchStrategy: 'exact',
          similarity: 1,
          confidence: 1,
        };
      }
    }
  }

  const normalizedTarget = normalizeForMatching(targetText);
  if (!normalizedTarget) return null;

  if (strategy === 'normalized' || strategy === 'all') {
    const normalizedMatch = boyerMooreSearch(index.normalizedText, normalizedTarget);
    if (normalizedMatch !== -1) {
      const result = mapNormalizedMatchToSegments(normalizedMatch, normalizedTarget, index);
      if (result && result.startSegmentIdx >= startIdx) {
        return {
          ...result,
          matchStrategy: 'normalized',
          similarity: 0.95,
          confidence: 0.95,
        };
      }
    }
  }

  if (strategy !== 'fuzzy' && strategy !== 'all') return null;

  let best: TextMatchResult | null = null;
  let bestScore = minSimilarity;
  const candidateIndices = scoreCandidateSegments(index, normalizedTarget, startIdx);

  for (const candidateIdx of candidateIndices) {
    const firstStart = Math.max(startIdx, candidateIdx - 2);
    const lastStart = Math.min(candidateIdx, transcript.length - 1);
    const maxEnd = Math.min(transcript.length - 1, candidateIdx + maxSegmentWindow);

    for (let windowStart = firstStart; windowStart <= lastStart; windowStart++) {
      let combined = '';
      for (let endIdx = windowStart; endIdx <= maxEnd; endIdx++) {
        const boundary = index.segmentBoundaries[endIdx];
        if (!boundary) continue;
        combined = combined ? `${combined} ${boundary.normalizedText}` : boundary.normalizedText;
        const similarity = Math.max(
          calculateNgramSimilarity(normalizedTarget, combined),
          calculateTokenContainmentSimilarity(normalizedTarget, combined),
        );
        if (similarity > bestScore) {
          bestScore = similarity;
          best = {
            found: true,
            startSegmentIdx: windowStart,
            endSegmentIdx: endIdx,
            startCharOffset: 0,
            endCharOffset: index.segmentBoundaries[endIdx]?.text.length ?? 0,
            matchStrategy: 'fuzzy-ngram',
            similarity,
            confidence: similarity,
          };
        }
      }
    }
  }

  return best;
}

export function matchQuote(index: TranscriptIndex, query: string): MatchResult | null {
  const result = findTextInTranscript(
    index.segmentBoundaries.map((boundary) => ({
      text: boundary.text,
      start: 0,
      duration: 0,
    })),
    query,
    index,
    { strategy: 'all', minSimilarity: FUZZY_THRESHOLD, maxSegmentWindow: 3 },
  );
  if (!result) return null;

  const matchStrategy: MatchResult['matchStrategy'] =
    result.matchStrategy === 'fuzzy-ngram' ? 'fuzzy' : result.matchStrategy;
  return {
    startSegmentIdx: result.startSegmentIdx,
    endSegmentIdx: result.endSegmentIdx,
    startCharOffset: result.startCharOffset,
    endCharOffset: result.endCharOffset,
    matchStrategy,
    similarity: matchStrategy === 'fuzzy' ? result.similarity : undefined,
    confidence: result.confidence,
  };
}

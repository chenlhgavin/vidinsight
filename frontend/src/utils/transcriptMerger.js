// Hard safeguards so we never return a single, video-length "sentence" when
// captions don't include punctuation (common with auto-generated transcripts).
const MAX_SENTENCE_DURATION_SECONDS = 24;
const MAX_SENTENCE_WORDS = 80;
const MAX_SEGMENTS_PER_SENTENCE = 20;

const COMMON_TLDS = [
  'com', 'org', 'net', 'edu', 'gov', 'co', 'io', 'ai', 'dev',
  'txt', 'pdf', 'jpg', 'png', 'gif', 'doc', 'zip', 'html', 'js', 'ts',
];
const COMMON_ABBREVS = ['dr', 'mr', 'mrs', 'ms', 'vs', 'etc', 'inc', 'ltd', 'jr', 'sr'];

const SENTENCE_PUNCTUATION_REGEX = /[.!?\u3002\uff01\uff1f\u203c\u2047\u2048]/g;
const WHITESPACE_GLOBAL_REGEX = /\s+/g;
const PUNCTUATION_OR_SPACE_REGEX = /[\s,;!?]/;
const DIGIT_REGEX = /\d/;
const NON_PERIOD_SENTENCE_ENDING_REGEX = /[!?\u3002\uff01\uff1f\u203c\u2047\u2048]$/;

function countWords(text) {
  if (!text) return 0;
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const isSpace = /\s/.test(text[i]);
    if (isSpace) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

function pushMergedSentence(merged, currentSentence, currentSegments, startIndex, endIndex) {
  if (currentSegments.length === 0) return;
  const firstSeg = currentSegments[0];
  const lastSeg = currentSegments[currentSegments.length - 1];
  merged.push({
    text: currentSentence.join(' ').replace(WHITESPACE_GLOBAL_REGEX, ' ').trim(),
    start: firstSeg.start,
    duration: (lastSeg.start + (lastSeg.duration || 0)) - firstSeg.start,
    startIndex,
    endIndex,
    segments: [...currentSegments],
  });
}

function isSentenceEndingPeriod(text, periodIndex) {
  const before = text.charAt(periodIndex - 1);
  const after = text.charAt(periodIndex + 1);

  if (DIGIT_REGEX.test(before) && DIGIT_REGEX.test(after)) {
    return false;
  }

  const afterPeriod = text.slice(periodIndex + 1, periodIndex + 5).toLowerCase();
  for (const pattern of COMMON_TLDS) {
    if (afterPeriod.startsWith(pattern)) {
      const charAfterPattern = text.charAt(periodIndex + 1 + pattern.length);
      if (!charAfterPattern || PUNCTUATION_OR_SPACE_REGEX.test(charAfterPattern)) {
        return false;
      }
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

function endsWithSentence(text) {
  const trimmed = text.trim();

  if (NON_PERIOD_SENTENCE_ENDING_REGEX.test(trimmed)) {
    return true;
  }

  if (trimmed.endsWith('.')) {
    const periodIndex = trimmed.length - 1;
    return isSentenceEndingPeriod(trimmed, periodIndex);
  }

  return false;
}

function findEarlyPunctuation(text) {
  const trimmed = text.trim();
  if (!trimmed) return -1;

  const matches = [];
  let match;
  SENTENCE_PUNCTUATION_REGEX.lastIndex = 0;
  while ((match = SENTENCE_PUNCTUATION_REGEX.exec(trimmed)) !== null) {
    matches.push(match.index);
  }

  if (matches.length === 0) return -1;

  const sentenceEndingMatches = matches.filter((index) => {
    const char = trimmed.charAt(index);
    if (char !== '.') return true;
    return isSentenceEndingPeriod(trimmed, index);
  });

  if (sentenceEndingMatches.length === 0) return -1;

  const firstPuncIndex = sentenceEndingMatches[0];
  const beforePunc = trimmed.slice(0, firstPuncIndex).trim();
  const wordsBefore = countWords(beforePunc);

  if (wordsBefore >= 0 && wordsBefore <= 2) {
    return firstPuncIndex + 1;
  }

  return -1;
}

function findLatePunctuation(text) {
  const trimmed = text.trim();
  if (!trimmed) return -1;

  const matches = [];
  let match;
  SENTENCE_PUNCTUATION_REGEX.lastIndex = 0;
  while ((match = SENTENCE_PUNCTUATION_REGEX.exec(trimmed)) !== null) {
    matches.push(match.index);
  }

  if (matches.length === 0) return -1;

  const sentenceEndingMatches = matches.filter((index) => {
    const char = trimmed.charAt(index);
    if (char !== '.') return true;
    return isSentenceEndingPeriod(trimmed, index);
  });

  if (sentenceEndingMatches.length === 0) return -1;

  const lastPuncIndex = sentenceEndingMatches[sentenceEndingMatches.length - 1];
  const afterPunc = trimmed.slice(lastPuncIndex + 1).trim();
  const wordsAfter = countWords(afterPunc);

  if (wordsAfter >= 1) {
    return lastPuncIndex + 1;
  }

  return -1;
}

/**
 * Merge transcript segments into complete sentences for readable display.
 *
 * @param {Array<{text: string, start: number, duration: number}>} segments
 * @returns {Array<{text: string, start: number, duration: number, segments: Array}>}
 */
export function mergeTranscriptSegments(segments) {
  if (!segments || segments.length === 0) return [];

  const merged = [];
  let currentSentence = [];
  let currentSegments = [];
  let currentWordCount = 0;
  let currentDuration = 0;
  let startIndex = 0;
  let carryoverText = '';

  const flushCurrent = (endIndex) => {
    pushMergedSentence(merged, currentSentence, currentSegments, startIndex, endIndex);
    currentSentence = [];
    currentSegments = [];
    currentWordCount = 0;
    currentDuration = 0;
  };

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    let text = segment.text || '';

    if (carryoverText) {
      text = carryoverText + ' ' + text;
      carryoverText = '';
    }

    if (!text.trim()) {
      if (currentSentence.length > 0) {
        currentSegments.push(segment);
      }
      continue;
    }

    // Early punctuation: ". You should" attaches period to previous sentence
    const earlySplitPos = findEarlyPunctuation(text);
    if (earlySplitPos > 0 && currentSentence.length > 0) {
      const beforeEarlyPunc = text.slice(0, earlySplitPos).trim();
      const afterEarlyPunc = text.slice(earlySplitPos).trim();

      if (beforeEarlyPunc) currentSentence.push(beforeEarlyPunc);
      currentSegments.push(segment);
      flushCurrent(i);

      if (afterEarlyPunc) {
        text = afterEarlyPunc;
      } else {
        continue;
      }
    }

    // Late punctuation: sentence-ending within last 2 words splits the segment
    const splitPos = findLatePunctuation(text);
    if (splitPos > 0) {
      const beforePunc = text.slice(0, splitPos).trim();
      const afterPunc = text.slice(splitPos).trim();

      if (currentSentence.length === 0) startIndex = i;
      if (beforePunc) currentSentence.push(beforePunc);
      currentSegments.push(segment);
      flushCurrent(i);

      if (afterPunc) carryoverText = afterPunc;
      continue;
    }

    // Safety cap: flush if adding this segment would exceed limits
    const segWords = countWords(text);
    const segDur = Math.max(segment.duration || 0, 0);
    if (currentSegments.length > 0 &&
        (currentWordCount + segWords > MAX_SENTENCE_WORDS ||
         currentDuration + segDur > MAX_SENTENCE_DURATION_SECONDS ||
         currentSegments.length + 1 > MAX_SEGMENTS_PER_SENTENCE)) {
      flushCurrent(i - 1);
    }

    // Add segment to current sentence
    if (currentSentence.length === 0) startIndex = i;
    currentSentence.push(text);
    currentSegments.push(segment);
    currentWordCount += segWords;
    currentDuration += segDur;

    // Check if segment ends a sentence
    if (endsWithSentence(text)) {
      flushCurrent(i);
    }
  }

  // Remaining text
  if (currentSentence.length > 0) {
    flushCurrent(segments.length - 1);
  }

  // Remaining carryover
  if (carryoverText.trim()) {
    const lastSeg = segments[segments.length - 1];
    merged.push({
      text: carryoverText.trim(),
      start: lastSeg.start,
      duration: lastSeg.duration || 0,
      startIndex: segments.length - 1,
      endIndex: segments.length - 1,
      segments: [lastSeg],
    });
  }

  return merged;
}

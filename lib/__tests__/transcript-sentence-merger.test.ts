import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeSegmentsIntoSentences,
  ensureMergedFormat,
} from '../transcript-sentence-merger';
import type { TranscriptSegment } from '../types';

describe('mergeSegmentsIntoSentences', () => {
  it('merges fragments until punctuation', () => {
    const input: TranscriptSegment[] = [
      { text: 'hello', start: 0, duration: 1 },
      { text: 'world', start: 1, duration: 1 },
      { text: 'today.', start: 2, duration: 1 },
      { text: 'next', start: 3, duration: 1 },
      { text: 'thing', start: 4, duration: 1 },
      { text: 'happens?', start: 5, duration: 1 },
    ];
    const out = mergeSegmentsIntoSentences(input);
    assert.equal(out.length, 2);
    assert.equal(out[0].text, 'hello world today.');
    assert.equal(out[0].start, 0);
    assert.equal(out[1].text, 'next thing happens?');
    assert.equal(out[1].start, 3);
  });

  it('flushes once max duration exceeded even without punctuation', () => {
    const input: TranscriptSegment[] = Array.from({ length: 15 }, (_, i) => ({
      text: `chunk-${i}`,
      start: i * 2,
      duration: 2,
    }));
    const out = mergeSegmentsIntoSentences(input);
    assert.ok(out.length >= 1);
    for (const sentence of out) {
      assert.ok(sentence.duration <= 24 + 0.001);
    }
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(mergeSegmentsIntoSentences([]), []);
  });

  it('preserves earliest segment start', () => {
    const input: TranscriptSegment[] = [
      { text: 'A', start: 10, duration: 1 },
      { text: 'B.', start: 11, duration: 1 },
    ];
    const out = mergeSegmentsIntoSentences(input);
    assert.equal(out[0].start, 10);
  });

  it('does not split common abbreviations, decimals, or URLs as sentence endings', () => {
    const input: TranscriptSegment[] = [
      { text: 'Dr.', start: 0, duration: 1 },
      { text: 'Smith cites 3.14 and example.com', start: 1, duration: 1 },
      { text: 'before the conclusion.', start: 2, duration: 1 },
    ];
    const out = mergeSegmentsIntoSentences(input);
    assert.equal(out.length, 1);
    assert.equal(out[0].text, 'Dr. Smith cites 3.14 and example.com before the conclusion.');
  });

  it('splits late punctuation and carries short trailing text forward', () => {
    const input: TranscriptSegment[] = [
      { text: 'This idea ends. next', start: 0, duration: 1 },
      { text: 'sentence continues.', start: 1, duration: 1 },
    ];
    const out = mergeSegmentsIntoSentences(input);
    assert.equal(out.length, 2);
    assert.equal(out[0].text, 'This idea ends.');
    assert.equal(out[1].text, 'next sentence continues.');
  });
});

describe('ensureMergedFormat', () => {
  it('passes through new-format unchanged', () => {
    const input: TranscriptSegment[] = [
      { text: 'This is a complete sentence number one.', start: 0, duration: 5 },
      { text: 'This is another full thought, well-formed.', start: 5, duration: 5 },
      { text: 'And here is the third sentence finalised properly.', start: 10, duration: 5 },
      { text: 'Sentence four says something meaningful too.', start: 15, duration: 5 },
      { text: 'Sentence five wraps up the test fixture nicely.', start: 20, duration: 5 },
    ];
    const out = ensureMergedFormat(input);
    assert.deepEqual(out, input);
  });

  it('merges old-format input', () => {
    const input: TranscriptSegment[] = Array.from({ length: 30 }, (_, i) => ({
      text: `frag${i}`,
      start: i,
      duration: 1,
    }));
    const out = ensureMergedFormat(input);
    assert.ok(out.length < input.length);
  });
});

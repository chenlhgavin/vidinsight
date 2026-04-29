import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  boyerMooreSearch,
  buildTranscriptIndex,
  findTextInTranscript,
  matchQuote,
} from '../quote-matcher';
import type { TranscriptSegment } from '../types';

const FIXTURE: TranscriptSegment[] = [
  { text: 'The future of AI is uncertain, but exciting.', start: 0, duration: 5 },
  { text: 'We need to think carefully about safety.', start: 5, duration: 5 },
  { text: 'Researchers are working on alignment problems.', start: 10, duration: 5 },
  { text: 'Public discourse must keep pace with the science.', start: 15, duration: 5 },
  { text: 'Otherwise, regulation will outstrip innovation.', start: 20, duration: 5 },
];

describe('matchQuote', () => {
  const index = buildTranscriptIndex(FIXTURE);

  it('returns exact match with confidence 1', () => {
    const m = matchQuote(index, 'We need to think carefully about safety.');
    assert.ok(m);
    assert.equal(m!.matchStrategy, 'exact');
    assert.equal(m!.confidence, 1);
    assert.equal(m!.startSegmentIdx, 1);
    assert.equal(m!.endSegmentIdx, 1);
  });

  it('matches case/punctuation variants via normalized strategy', () => {
    const m = matchQuote(
      index,
      'we need TO think carefully ABOUT safety',
    );
    assert.ok(m);
    assert.equal(m!.matchStrategy, 'normalized');
    assert.ok(m!.confidence >= 0.95);
  });

  it('matches paraphrase via fuzzy strategy', () => {
    const m = matchQuote(index, 'researchers working on alignment problems');
    assert.ok(m);
    assert.ok(['fuzzy', 'normalized'].includes(m!.matchStrategy));
    assert.ok(m!.confidence >= 0.5);
  });

  it('returns null for unrelated query', () => {
    const m = matchQuote(index, 'unrelated nonsense quantum spaghetti carburetor');
    assert.equal(m, null);
  });

  it('returns first occurrence when query appears multiple times', () => {
    const repeated: TranscriptSegment[] = [
      { text: 'foo bar baz.', start: 0, duration: 1 },
      { text: 'something else entirely.', start: 1, duration: 1 },
      { text: 'foo bar baz again.', start: 2, duration: 1 },
    ];
    const idx = buildTranscriptIndex(repeated);
    const m = matchQuote(idx, 'foo bar baz');
    assert.ok(m);
    assert.equal(m!.startSegmentIdx, 0);
  });

  it('handles empty query / index gracefully', () => {
    assert.equal(matchQuote(index, ''), null);
    const empty = buildTranscriptIndex([]);
    assert.equal(matchQuote(empty, 'anything'), null);
  });

  it('uses Boyer-Moore search for exact matching helpers', () => {
    assert.equal(boyerMooreSearch('alpha beta gamma', 'beta'), 6);
    assert.equal(boyerMooreSearch('alpha beta gamma', 'delta'), -1);
  });

  it('maps normalized matches back to original character offsets', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Wait, Safety-first thinking matters.', start: 0, duration: 4 },
    ];
    const idx = buildTranscriptIndex(segments);
    const m = matchQuote(idx, 'safety first thinking');
    assert.ok(m);
    assert.equal(m!.matchStrategy, 'normalized');
    assert.equal(segments[0].text.slice(m!.startCharOffset, m!.endCharOffset), 'Safety-first thinking');
  });

  it('findTextInTranscript supports timestamp-near range search', () => {
    const m = findTextInTranscript(FIXTURE, 'alignment problems', index, {
      startIdx: 2,
      minSimilarity: 0.75,
      maxSegmentWindow: 2,
    });
    assert.ok(m);
    assert.equal(m!.startSegmentIdx, 2);
  });
});

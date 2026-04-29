import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractThemes,
  findCandidatesForTheme,
  hydrateTopicsWithTranscript,
  topicQuoteKey,
} from '../topic-utils';
import type { Topic, TopicCandidate, TranscriptSegment } from '../types';

const candidates: TopicCandidate[] = [
  { key: 'a', title: 'Safety culture in AI labs', quote: { timestamp: '0:01', text: '' } },
  { key: 'b', title: 'Alignment research priorities', quote: { timestamp: '0:02', text: '' } },
  { key: 'c', title: 'Future of safety in deployment', quote: { timestamp: '0:03', text: '' } },
  { key: 'd', title: 'Hardware constraints', quote: { timestamp: '0:04', text: '' } },
  { key: 'e', title: 'Hardware availability and cost', quote: { timestamp: '0:05', text: '' } },
];

describe('extractThemes', () => {
  it('returns words appearing >= 2 times', () => {
    const themes = extractThemes(candidates);
    assert.ok(themes.includes('safety'));
    assert.ok(themes.includes('hardware'));
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(extractThemes([]), []);
  });

  it('caps at 5 themes', () => {
    const many: TopicCandidate[] = Array.from({ length: 30 }, (_, i) => ({
      key: `k${i}`,
      title: `theme${i % 8} extra word${i % 8} here`,
      quote: { timestamp: '0:00', text: '' },
    }));
    assert.ok(extractThemes(many).length <= 5);
  });
});

describe('findCandidatesForTheme', () => {
  it('does case-insensitive substring match', () => {
    const result = findCandidatesForTheme('Safety', candidates);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map((c) => c.key).sort(), ['a', 'c']);
  });

  it('returns empty when nothing matches', () => {
    assert.deepEqual(findCandidatesForTheme('missing', candidates), []);
  });
});

describe('topicQuoteKey', () => {
  it('builds the same exclusion key used by topic generation', () => {
    assert.equal(
      topicQuoteKey({
        quote: {
          timestamp: '[0:01-0:10]',
          text: '  Safety   culture\nmatters  ',
        },
      }),
      '[0:01-0:10]|safety culture matters',
    );
  });

  it('returns null when quote data is missing', () => {
    assert.equal(topicQuoteKey({}), null);
    assert.equal(topicQuoteKey({ quote: { timestamp: '[0:01-0:10]', text: '' } }), null);
  });
});

describe('hydrateTopicsWithTranscript', () => {
  const transcript: TranscriptSegment[] = [
    { text: 'First sentence is ordinary.', start: 0, duration: 4 },
    { text: 'The exact insight appears right here.', start: 4, duration: 6 },
    { text: 'Closing sentence follows.', start: 10, duration: 4 },
  ];

  it('hydrates empty topic segments from quote text with character offsets', () => {
    const topics: Topic[] = [
      {
        id: 't1',
        title: 'Exact insight',
        duration: 0,
        segments: [],
        quote: { timestamp: '[0:04-0:10]', text: 'exact insight appears' },
      },
    ];

    const [topic] = hydrateTopicsWithTranscript(topics, transcript);
    assert.equal(topic.segments.length, 1);
    assert.equal(topic.segments[0].startSegmentIdx, 1);
    assert.equal(
      transcript[1].text.slice(topic.segments[0].startCharOffset, topic.segments[0].endCharOffset),
      'exact insight appears',
    );
    assert.ok(topic.duration > 0);
  });

  it('falls back to timestamp ranges when quote text is unavailable', () => {
    const topics: Topic[] = [
      {
        id: 't2',
        title: 'Timestamp fallback',
        duration: 0,
        segments: [],
        quote: { timestamp: '[0:10-0:14]', text: '' },
      },
    ];

    const [topic] = hydrateTopicsWithTranscript(topics, transcript);
    assert.equal(topic.segments[0].startSegmentIdx, 2);
    assert.equal(topic.segments[0].endSegmentIdx, 2);
  });
});

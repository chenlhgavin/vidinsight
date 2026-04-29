import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlaybackQueue, focusForQueueItem } from '../playback-queue';
import type { Citation, Topic } from '../types';

const topicA: Topic = {
  id: 'a',
  title: 'Topic A',
  duration: 15,
  segments: [
    { start: 10, end: 20, text: 'first' },
    { start: 30, end: 35, text: 'second' },
  ],
};

const topicB: Topic = {
  id: 'b',
  title: 'Topic B',
  duration: 7,
  segments: [
    { start: 40, end: 47, text: 'third' },
    { start: 50, end: 50, text: 'invalid' },
  ],
};

const citations: Citation[] = [
  {
    number: 1,
    text: 'citation one',
    start: 5,
    end: 9,
    startSegmentIdx: 0,
    endSegmentIdx: 0,
    startCharOffset: 0,
    endCharOffset: 12,
  },
  {
    number: 2,
    text: 'invalid citation',
    start: 12,
    end: 12,
    startSegmentIdx: 1,
    endSegmentIdx: 1,
    startCharOffset: 0,
    endCharOffset: 8,
  },
  {
    number: 3,
    text: 'citation three',
    start: 60,
    end: 64,
    startSegmentIdx: 4,
    endSegmentIdx: 4,
    startCharOffset: 2,
    endCharOffset: 14,
  },
];

test('PLAY_TOPIC expands all valid topic segments in order', () => {
  const queue = buildPlaybackQueue({ type: 'PLAY_TOPIC', topic: topicA, autoPlay: true });
  assert.deepEqual(
    queue.map((item) => [item.kind, item.start, item.end, item.segmentIndex]),
    [
      ['topic', 10, 20, 0],
      ['topic', 30, 35, 1],
    ],
  );
});

test('PLAY_ALL expands topics and skips invalid ranges', () => {
  const queue = buildPlaybackQueue({ type: 'PLAY_ALL', topics: [topicA, topicB], autoPlay: true });
  assert.deepEqual(
    queue.map((item) => [item.topic?.id, item.start, item.end, item.topicIndex, item.segmentIndex]),
    [
      ['a', 10, 20, 0, 0],
      ['a', 30, 35, 0, 1],
      ['b', 40, 47, 1, 0],
    ],
  );
});

test('PLAY_CITATIONS expands citations and preserves metadata', () => {
  const queue = buildPlaybackQueue({ type: 'PLAY_CITATIONS', citations, autoPlay: true });
  assert.equal(queue.length, 2);
  assert.equal(queue[0].citation?.number, 1);
  assert.equal(queue[1].citation?.number, 3);
  assert.equal(queue[1].startCharOffset, 2);

  const focus = focusForQueueItem(queue[1]);
  assert.equal(focus.kind, 'citation');
  if (focus.kind === 'citation') {
    assert.equal(focus.citation.number, 3);
    assert.equal(focus.segment.start, 60);
  }
});

test('empty or invalid commands produce an empty queue', () => {
  assert.deepEqual(buildPlaybackQueue({ type: 'PLAY_ALL', topics: [] }), []);
  assert.deepEqual(buildPlaybackQueue({ type: 'PLAY_SEGMENT', segment: { start: 5, end: 5 } }), []);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFallbackQuoteTopics,
  chunkTranscriptForTopics,
  generateTopics,
  getTopicGenerationModel,
  hydrateQuoteTopics,
} from '../ai-processing';
import type { TranscriptSegment } from '../types';

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T> | T) {
  const original = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    original.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function transcript(durationSeconds: number): TranscriptSegment[] {
  return [
    {
      start: 0,
      duration: durationSeconds,
      text: 'We need to think carefully about safety before deploying powerful systems.',
    },
  ];
}

test('getTopicGenerationModel uses AI_DEFAULT_MODEL for deprecated fast mode', async () => {
  await withEnv(
    {
      AI_DEFAULT_MODEL: 'default-model',
    },
    () => {
      assert.equal(
        getTopicGenerationModel({ mode: 'fast', transcript: transcript(3_600) }),
        'default-model',
      );
    },
  );
});

test('getTopicGenerationModel uses AI_DEFAULT_MODEL for long and short smart videos', async () => {
  await withEnv(
    {
      AI_DEFAULT_MODEL: 'default-model',
    },
    () => {
      assert.equal(
        getTopicGenerationModel({ mode: 'smart', transcript: transcript(1_801) }),
        'default-model',
      );
      assert.equal(
        getTopicGenerationModel({ mode: 'smart', transcript: transcript(1_800) }),
        'default-model',
      );
    },
  );
});

test('chunkTranscriptForTopics creates overlapping windows for long transcripts', () => {
  const segments = Array.from({ length: 12 }, (_, index) => ({
    start: index * 60,
    duration: 60,
    text: `segment ${index}`,
  }));

  const chunks = chunkTranscriptForTopics(segments, 300, 60);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].start, 0);
  assert.ok(chunks[1].start < chunks[0].end);
});

test('hydrateQuoteTopics creates playable topic segments from exact quotes', () => {
  const segments = [
    {
      start: 0,
      duration: 10,
      text: 'We need to think carefully about safety.',
    },
    {
      start: 10,
      duration: 10,
      text: 'Deployment should happen gradually.',
    },
  ];

  const topics = hydrateQuoteTopics(
    [
      {
        title: 'Safety before deployment',
        quote: {
          timestamp: '[0:00-0:10]',
          text: 'We need to think carefully about safety.',
        },
      },
    ],
    segments,
  );

  assert.equal(topics.length, 1);
  assert.equal(topics[0].segments[0].start, 0);
  assert.equal(topics[0].segments[0].end, 10);
  assert.equal(topics[0].duration, 10);
});

test('generateTopics falls back locally when MiniMax is unavailable', async () => {
  await withEnv({ MINIMAX_API_KEY: undefined }, async () => {
    const result = await generateTopics({
      transcript: transcript(120),
      mode: 'fast',
      includeCandidatePool: true,
    });

    assert.equal(result.modeUsed, 'smart');
    assert.equal(result.generationStrategy, 'local-fallback');
    assert.ok(result.topics.length > 0);
    assert.ok(result.topicCandidates && result.topicCandidates.length > 0);
  });
});

test('buildFallbackQuoteTopics returns timestamped quote topics', () => {
  const topics = buildFallbackQuoteTopics(transcript(120), 3);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].title, 'Highlights from 0:00-2:00');
  assert.equal(topics[0].quote.timestamp, '[0:00-2:00]');
});

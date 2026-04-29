import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectTranscriptFormat } from '../transcript-format-detector';
import type { TranscriptSegment } from '../types';

function makeSegments(texts: string[]): TranscriptSegment[] {
  return texts.map((text, i) => ({ text, start: i, duration: 1 }));
}

describe('detectTranscriptFormat', () => {
  it('classifies modern full-sentence transcript as new', () => {
    const segments = makeSegments([
      'The future of AI is uncertain, but exciting.',
      'We need to think carefully about safety.',
      'Researchers are working on alignment problems.',
      'Public discourse must keep pace with the science.',
      'Otherwise, regulation will outstrip innovation.',
    ]);
    assert.equal(detectTranscriptFormat(segments), 'new');
  });

  it('classifies short auto-caption fragments as old', () => {
    const segments = makeSegments(
      Array.from({ length: 30 }, (_, i) => `fragment ${i % 4} of speech`),
    );
    assert.equal(detectTranscriptFormat(segments), 'old');
  });

  it('returns new for empty input', () => {
    assert.equal(detectTranscriptFormat([]), 'new');
  });

  it('falls back deterministically on a single full sentence', () => {
    const segments = makeSegments(['Hello world this is a complete sentence.']);
    assert.equal(detectTranscriptFormat(segments), 'new');
  });
});

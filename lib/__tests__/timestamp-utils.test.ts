import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimestamp, formatTimestamp, parseTimestampRange } from '../timestamp-utils';

describe('parseTimestamp', () => {
  it('parses M:SS', () => {
    assert.equal(parseTimestamp('1:23'), 83);
  });

  it('parses H:MM:SS', () => {
    assert.equal(parseTimestamp('1:02:03'), 3723);
  });

  it('parses single-minute timestamp', () => {
    assert.equal(parseTimestamp('0:30'), 30);
  });

  it('returns null on invalid input', () => {
    assert.equal(parseTimestamp(''), null);
    assert.equal(parseTimestamp('garbage'), null);
    assert.equal(parseTimestamp('1:2'), null); // SS must be two-digit
    assert.equal(parseTimestamp('1::23'), null);
  });
});

describe('formatTimestamp', () => {
  it('round-trips with parseTimestamp', () => {
    for (const seconds of [0, 5, 65, 600, 3661, 7325]) {
      const round = parseTimestamp(formatTimestamp(seconds));
      assert.equal(round, seconds);
    }
  });

  it('clamps invalid input to 0:00', () => {
    assert.equal(formatTimestamp(NaN), '0:00');
    assert.equal(formatTimestamp(-3), '0:00');
  });
});

describe('parseTimestampRange', () => {
  it('parses bracketed timestamp ranges', () => {
    assert.deepEqual(parseTimestampRange('[1:02-2:03]'), { start: 62, end: 123 });
    assert.deepEqual(parseTimestampRange('[1:02:03-1:03:04]'), {
      start: 3723,
      end: 3784,
    });
  });

  it('allows common range separators', () => {
    assert.deepEqual(parseTimestampRange('[1:02 to 2:03]'), { start: 62, end: 123 });
    assert.deepEqual(parseTimestampRange('[1:02–2:03]'), { start: 62, end: 123 });
  });

  it('returns null for invalid ranges', () => {
    assert.equal(parseTimestampRange(''), null);
    assert.equal(parseTimestampRange('[1:2-2:03]'), null);
    assert.equal(parseTimestampRange('[2:03-1:02]'), null);
    assert.equal(parseTimestampRange('[1:02]'), null);
  });
});

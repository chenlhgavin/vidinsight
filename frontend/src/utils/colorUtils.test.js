import { describe, it, expect } from 'vitest';
import { getTopicHSLColor, formatDuration } from './colorUtils';

describe('getTopicHSLColor', () => {
  it('returns a valid HSL string for index 0 without videoId', () => {
    const color = getTopicHSLColor(0);
    expect(color).toMatch(/^\d+ \d+% \d+%$/);
  });

  it('cycles colors when index exceeds palette length', () => {
    const color0 = getTopicHSLColor(0);
    const color7 = getTopicHSLColor(7);
    expect(color7).toBe(color0);
  });

  it('returns deterministic shuffled colors for a given videoId', () => {
    const colorA1 = getTopicHSLColor(0, 'abc123');
    const colorA2 = getTopicHSLColor(0, 'abc123');
    expect(colorA1).toBe(colorA2);
  });

  it('returns different order for different videoIds', () => {
    const colorsA = Array.from({ length: 7 }, (_, i) => getTopicHSLColor(i, 'video-A'));
    const colorsB = Array.from({ length: 7 }, (_, i) => getTopicHSLColor(i, 'video-B'));
    expect([...colorsA].sort()).toEqual([...colorsB].sort());
    const hasDifference = colorsA.some((c, i) => c !== colorsB[i]);
    expect(hasDifference).toBe(true);
  });
});

describe('formatDuration', () => {
  it('returns MM:SS for seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(3661)).toBe('61:01');
  });
});

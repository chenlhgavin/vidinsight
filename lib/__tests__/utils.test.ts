import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVideoSlug,
  extractVideoIdFromSlug,
  extractVideoId,
  formatDuration,
  formatTopicDuration,
  resolveAppUrl,
} from '../utils';

describe('extractVideoId', () => {
  it('parses raw 11-char id', () => {
    assert.equal(extractVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  });

  it('parses youtu.be short link', () => {
    assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  });

  it('parses watch?v= form with extra params', () => {
    assert.equal(
      extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'),
      'dQw4w9WgXcQ',
    );
  });

  it('parses /shorts/ form', () => {
    assert.equal(
      extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ',
    );
  });

  it('parses /embed/ form', () => {
    assert.equal(
      extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1'),
      'dQw4w9WgXcQ',
    );
  });

  it('parses /v/ form', () => {
    assert.equal(
      extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ',
    );
  });

  it('parses youtube-nocookie domain', () => {
    assert.equal(
      extractVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ',
    );
  });

  it('rejects non-YouTube URLs', () => {
    assert.equal(extractVideoId('https://example.com/foo'), null);
  });

  it('rejects empty / malformed', () => {
    assert.equal(extractVideoId(''), null);
    assert.equal(extractVideoId('not a url'), null);
    assert.equal(extractVideoId('http://[::]'), null);
  });

  it('rejects too-short or too-long ids', () => {
    assert.equal(extractVideoId('abc'), null);
    assert.equal(extractVideoId('aaaaaaaaaaaaaaaaa'), null);
  });
});

describe('video slugs', () => {
  it('builds canonical title-id slugs', () => {
    assert.equal(
      buildVideoSlug('Hello, World! This is a Video', 'dQw4w9WgXcQ'),
      'hello-world-this-is-a-video-dQw4w9WgXcQ',
    );
  });

  it('falls back to video for empty or non-ascii titles', () => {
    assert.equal(buildVideoSlug('中文标题', 'dQw4w9WgXcQ'), 'video-dQw4w9WgXcQ');
    assert.equal(buildVideoSlug('', 'dQw4w9WgXcQ'), 'video-dQw4w9WgXcQ');
  });

  it('extracts ids from canonical slugs and raw ids', () => {
    assert.equal(
      extractVideoIdFromSlug('hello-world-dQw4w9WgXcQ'),
      'dQw4w9WgXcQ',
    );
    assert.equal(extractVideoIdFromSlug('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  });

  it('rejects invalid slugs', () => {
    assert.equal(extractVideoIdFromSlug('hello'), null);
    assert.equal(buildVideoSlug('Title', 'bad'), '');
  });
});

describe('formatDuration', () => {
  it('formats seconds < 1 hour as M:SS', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(7), '0:07');
    assert.equal(formatDuration(65), '1:05');
    assert.equal(formatDuration(3599), '59:59');
  });

  it('formats >= 1 hour as H:MM:SS', () => {
    assert.equal(formatDuration(3600), '1:00:00');
    assert.equal(formatDuration(3661), '1:01:01');
  });

  it('handles invalid input safely', () => {
    assert.equal(formatDuration(NaN), '0:00');
    assert.equal(formatDuration(-5), '0:00');
  });
});

describe('formatTopicDuration', () => {
  it('renders < 60s as seconds', () => {
    assert.equal(formatTopicDuration(45), '45 sec');
  });

  it('renders 1-59 min as minutes', () => {
    assert.equal(formatTopicDuration(60), '1 min');
    assert.equal(formatTopicDuration(150), '3 min'); // rounded
  });

  it('renders >= 1h as hours and minutes', () => {
    assert.equal(formatTopicDuration(3600), '1h');
    assert.equal(formatTopicDuration(5400), '1h 30m');
  });
});

describe('resolveAppUrl', () => {
  function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
    const keys = ['NEXT_PUBLIC_APP_URL', 'VERCEL_ENV', 'VERCEL_URL'];
    const snapshot: Record<string, string | undefined> = {};
    for (const k of keys) snapshot[k] = process.env[k];
    try {
      for (const k of keys) {
        if (vars[k] === undefined) delete process.env[k];
        else process.env[k] = vars[k];
      }
      fn();
    } finally {
      for (const k of keys) {
        if (snapshot[k] === undefined) delete process.env[k];
        else process.env[k] = snapshot[k];
      }
    }
  }

  it('returns NEXT_PUBLIC_APP_URL when set', () => {
    withEnv({ NEXT_PUBLIC_APP_URL: 'https://prod.example.com' }, () => {
      assert.equal(resolveAppUrl(), 'https://prod.example.com');
    });
  });

  it('strips trailing slashes', () => {
    withEnv({ NEXT_PUBLIC_APP_URL: 'https://prod.example.com////' }, () => {
      assert.equal(resolveAppUrl(), 'https://prod.example.com');
    });
  });

  it('uses VERCEL_URL on preview when NEXT_PUBLIC_APP_URL is unset', () => {
    withEnv({ VERCEL_ENV: 'preview', VERCEL_URL: 'preview-abc123.vercel.app' }, () => {
      assert.equal(resolveAppUrl(), 'https://preview-abc123.vercel.app');
    });
  });
});

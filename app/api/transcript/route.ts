import { NextResponse } from 'next/server';
import { extractVideoId } from '@/lib/utils';
import {
  fetchYouTubeTranscript,
  type TranscriptFetchResult,
} from '@/lib/youtube-transcript-provider';
import { fetchSupadataTranscript } from '@/lib/supadata-transcript-provider';
import { ensureMergedFormat } from '@/lib/transcript-sentence-merger';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Dedupe concurrent transcript fetches for the same videoId AND keep a
// short-lived result cache. Without this, React StrictMode (or any client
// that retries) can fire two requests; the first succeeds, but Supadata
// returns "empty transcript" for the rapid second call (per-video cooldown),
// and the failure leaks to the UI as transcript_failed. Caching successful
// results for a short window makes a quick re-fetch a no-op. We anchor the
// state on globalThis so Next.js dev / Turbopack module reloads don't drop
// the cache between requests.
type State = {
  inflight: Map<string, Promise<TranscriptFetchResult | null>>;
  recent: Map<string, { result: TranscriptFetchResult; expiry: number }>;
};
const STATE_KEY = '__vidinsight_transcript_state__';
const g = globalThis as unknown as Record<string, unknown>;
const state: State = (g[STATE_KEY] as State | undefined) ?? {
  inflight: new Map(),
  recent: new Map(),
};
g[STATE_KEY] = state;
const { inflight, recent } = state;
const RESULT_TTL_MS = 60_000;

function getCached(key: string): TranscriptFetchResult | null {
  const entry = recent.get(key);
  if (!entry) return null;
  if (entry.expiry <= Date.now()) {
    recent.delete(key);
    return null;
  }
  return entry.result;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of recent) if (v.expiry <= now) recent.delete(k);
}

async function fetchWithFallback(
  videoId: string,
  preferredLanguage: string | undefined,
  signal: AbortSignal,
): Promise<TranscriptFetchResult | null> {
  const preferSupadata = process.env.TRANSCRIPT_PREFER_SUPADATA === '1';
  let result = preferSupadata
    ? await fetchSupadataTranscript(videoId, signal)
    : await fetchYouTubeTranscript(videoId, preferredLanguage, signal);
  if (!result || result.segments.length === 0) {
    result = preferSupadata
      ? await fetchYouTubeTranscript(videoId, preferredLanguage, signal)
      : await fetchSupadataTranscript(videoId, signal);
  }
  return result && result.segments.length > 0 ? result : null;
}

export const POST = withSecurity(SECURITY_PRESETS.PUBLIC, async (_request, ctx) => {
  const body = ctx.parsedBody as
    | { videoId?: string; url?: string; preferredLanguage?: string }
    | null;
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const videoId = extractVideoId(body.videoId || body.url || '');
  if (!videoId) return NextResponse.json({ error: 'invalid videoId' }, { status: 400 });

  const dedupeKey = `${videoId}:${body.preferredLanguage ?? ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);

  try {
    const cached = getCached(dedupeKey);
    if (cached) {
      console.log(`[transcript] cache HIT ${dedupeKey} (recent=${recent.size})`);
      return NextResponse.json({
        videoId,
        transcript: ensureMergedFormat(cached.segments),
        language: cached.language,
        availableLanguages: cached.availableLanguages,
      });
    }
    let promise = inflight.get(dedupeKey);
    if (promise) {
      console.log(`[transcript] inflight HIT ${dedupeKey}`);
    } else {
      console.log(
        `[transcript] cache MISS ${dedupeKey} (recent=${recent.size}, inflight=${inflight.size}) — fetching`,
      );
      promise = fetchWithFallback(videoId, body.preferredLanguage, controller.signal)
        .then((result) => {
          if (result) {
            recent.set(dedupeKey, { result, expiry: Date.now() + RESULT_TTL_MS });
            console.log(
              `[transcript] cache STORE ${dedupeKey} (segments=${result.segments.length}, recent=${recent.size})`,
            );
            sweep();
          } else {
            console.log(`[transcript] no cache (result null) ${dedupeKey}`);
          }
          return result;
        })
        .finally(() => inflight.delete(dedupeKey));
      inflight.set(dedupeKey, promise);
    }
    const result = await promise;
    if (!result) {
      return NextResponse.json({ error: 'transcript_unavailable' }, { status: 404 });
    }
    const merged = ensureMergedFormat(result.segments);
    return NextResponse.json({
      videoId,
      transcript: merged,
      language: result.language,
      availableLanguages: result.availableLanguages,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'timeout' }, { status: 504 });
    }
    console.error('[transcript]', err);
    return NextResponse.json({ error: 'transcript_failed' }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
});

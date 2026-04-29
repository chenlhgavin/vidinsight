import { NextResponse } from 'next/server';
import { fetchVideoInfo } from '@/lib/video-info-provider';
import type { VideoInfo } from '@/lib/types';
import { extractVideoId } from '@/lib/utils';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';
export const maxDuration = 15;

type State = {
  inflight: Map<string, Promise<VideoInfo>>;
  recent: Map<string, { info: VideoInfo; expiry: number }>;
};
const STATE_KEY = '__vidinsight_video_info_state__';
const g = globalThis as unknown as Record<string, unknown>;
const state: State = (g[STATE_KEY] as State | undefined) ?? {
  inflight: new Map(),
  recent: new Map(),
};
g[STATE_KEY] = state;
const { inflight, recent } = state;
const RESULT_TTL_MS = 60_000;

export const GET = withSecurity(SECURITY_PRESETS.PUBLIC, async (request) => {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('videoId') || searchParams.get('url') || '';
  const videoId = extractVideoId(raw);
  if (!videoId) {
    return NextResponse.json({ error: 'invalid videoId' }, { status: 400 });
  }
  const cached = recent.get(videoId);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json(cached.info);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    let promise = inflight.get(videoId);
    if (!promise) {
      promise = fetchVideoInfo(videoId, controller.signal)
        .then((info) => {
          recent.set(videoId, { info, expiry: Date.now() + RESULT_TTL_MS });
          for (const [k, v] of recent) if (v.expiry <= Date.now()) recent.delete(k);
          return info;
        })
        .finally(() => inflight.delete(videoId));
      inflight.set(videoId, promise);
    }
    const info = await promise;
    return NextResponse.json(info);
  } finally {
    clearTimeout(timeout);
  }
});

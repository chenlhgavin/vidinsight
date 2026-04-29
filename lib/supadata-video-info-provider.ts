import type { VideoInfo } from '@/lib/types';
import { youtubeThumbnail } from '@/lib/utils';
import { runSerial } from '@/lib/supadata-queue';

const SUPADATA_BASE = process.env.SUPADATA_API_BASE || 'https://api.supadata.ai';

// Defensive shape: different Supadata plan tiers return slightly different
// field names. We accept several common spellings rather than assume one.
interface SupadataVideoResponse {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  channel?: { id?: string; name?: string; title?: string };
  channelTitle?: string;
  channelName?: string;
  channelId?: string;
  thumbnail?: string;
  thumbnails?: { url?: string }[] | { default?: { url?: string } };
  tags?: string[];
  language?: string;
}

function pickThumbnail(data: SupadataVideoResponse, videoId: string): string {
  if (typeof data.thumbnail === 'string') return data.thumbnail;
  if (Array.isArray(data.thumbnails) && data.thumbnails[0]?.url) {
    return data.thumbnails[0].url;
  }
  if (
    data.thumbnails &&
    !Array.isArray(data.thumbnails) &&
    data.thumbnails.default?.url
  ) {
    return data.thumbnails.default.url;
  }
  return youtubeThumbnail(videoId);
}

function pickAuthor(data: SupadataVideoResponse): string | null {
  return (
    data.channel?.name ||
    data.channel?.title ||
    data.channelName ||
    data.channelTitle ||
    null
  );
}

export async function fetchSupadataVideoInfo(
  videoId: string,
  signal?: AbortSignal,
): Promise<VideoInfo | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    console.warn('[supadata-video] SUPADATA_API_KEY missing — skipping fallback');
    return null;
  }

  const url = `${SUPADATA_BASE}/v1/youtube/video?id=${encodeURIComponent(videoId)}`;
  let resp: Response;
  try {
    resp = await runSerial(() =>
      fetch(url, {
        headers: { 'x-api-key': apiKey, Accept: 'application/json' },
        signal,
      }),
    );
  } catch (err) {
    console.warn('[supadata-video] network failure:', err);
    return null;
  }

  if (!resp.ok) {
    console.warn(`[supadata-video] returned ${resp.status} for ${videoId}`);
    return null;
  }

  const data = (await resp.json().catch(() => null)) as SupadataVideoResponse | null;
  if (!data || (!data.title && !pickAuthor(data))) {
    console.warn(`[supadata-video] unusable response for ${videoId}`);
    return null;
  }

  const author = pickAuthor(data) || 'Unknown';
  const info: VideoInfo = {
    videoId,
    title: data.title || `YouTube video ${videoId}`,
    author,
    thumbnail: pickThumbnail(data, videoId),
    duration: typeof data.duration === 'number' ? data.duration : null,
    description: data.description,
    tags: data.tags,
    language: data.language,
  };
  console.log(
    `[supadata-video] ok ${videoId} (title="${info.title.slice(0, 40)}", author=${info.author})`,
  );
  return info;
}

import type { VideoInfo } from '@/lib/types';
import { youtubeThumbnail } from '@/lib/utils';
import { fetchSupadataVideoInfo } from '@/lib/supadata-video-info-provider';

const OEMBED_URL = 'https://www.youtube.com/oembed';

async function fetchOembed(
  videoId: string,
  signal?: AbortSignal,
): Promise<VideoInfo | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembed = `${OEMBED_URL}?url=${encodeURIComponent(watchUrl)}&format=json`;
  try {
    const r = await fetch(oembed, { signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      videoId,
      title: data.title || `YouTube video ${videoId}`,
      author: data.author_name || 'Unknown',
      thumbnail: data.thumbnail_url || youtubeThumbnail(videoId),
      duration: null,
    };
  } catch {
    return null;
  }
}

function placeholder(videoId: string): VideoInfo {
  return {
    videoId,
    title: `YouTube video ${videoId}`,
    author: 'Unknown',
    thumbnail: youtubeThumbnail(videoId),
    duration: null,
  };
}

export async function fetchVideoInfo(
  videoId: string,
  signal?: AbortSignal,
): Promise<VideoInfo> {
  const preferSupadata = process.env.TRANSCRIPT_PREFER_SUPADATA === '1';

  if (preferSupadata) {
    const supa = await fetchSupadataVideoInfo(videoId, signal);
    if (supa) return supa;
    const oembed = await fetchOembed(videoId, signal);
    if (oembed) return oembed;
  } else {
    const oembed = await fetchOembed(videoId, signal);
    if (oembed) return oembed;
    const supa = await fetchSupadataVideoInfo(videoId, signal);
    if (supa) return supa;
  }

  return placeholder(videoId);
}

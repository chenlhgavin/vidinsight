import type { TranscriptFetchResult } from '@/lib/youtube-transcript-provider';
import { runSerial } from '@/lib/supadata-queue';

const SUPADATA_BASE = process.env.SUPADATA_API_BASE || 'https://api.supadata.ai';

interface SupadataResponse {
  content?: { text: string; offset: number; duration: number }[];
  lang?: string;
  availableLangs?: string[];
}

export async function fetchSupadataTranscript(
  videoId: string,
  signal?: AbortSignal,
): Promise<TranscriptFetchResult | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    console.warn('[supadata] SUPADATA_API_KEY missing — skipping fallback');
    return null;
  }

  const url = `${SUPADATA_BASE}/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}&text=false`;
  let resp: Response;
  try {
    resp = await runSerial(() =>
      fetch(url, {
        headers: { 'x-api-key': apiKey, Accept: 'application/json' },
        signal,
      }),
    );
  } catch (err) {
    console.warn('[supadata] network failure:', err);
    return null;
  }

  if (!resp.ok) {
    console.warn(`[supadata] returned ${resp.status} for ${videoId}`);
    return null;
  }

  const data = (await resp.json()) as SupadataResponse;
  if (!data?.content?.length) {
    console.warn(`[supadata] empty transcript for ${videoId}`);
    return null;
  }

  console.log(
    `[supadata] ok ${videoId} (${data.content.length} segments, lang=${data.lang ?? 'auto'})`,
  );

  return {
    segments: data.content.map((s) => ({
      text: s.text,
      start: (s.offset || 0) / 1000,
      duration: (s.duration || 0) / 1000,
    })),
    language: data.lang,
    availableLanguages: data.availableLangs ?? [],
  };
}

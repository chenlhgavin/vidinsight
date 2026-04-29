/**
 * InnerTube transcript fetcher with Android → Web → iOS fallback.
 * Adapted from longcat reference (vendors/longcut/lib/youtube-transcript-provider.ts).
 */

export interface TranscriptFetchResult {
  segments: { text: string; start: number; duration: number }[];
  language?: string;
  availableLanguages: string[];
}

export type TranscriptErrorCode =
  | 'BOT_DETECTED'
  | 'AGE_RESTRICTED'
  | 'VIDEO_UNAVAILABLE'
  | 'TRANSCRIPTS_DISABLED'
  | 'NO_TRANSCRIPT'
  | 'IP_BLOCKED'
  | 'PAGE_FETCH_FAILED'
  | 'INNERTUBE_REJECTED'
  | 'CAPTION_FETCH_FAILED'
  | 'UNKNOWN';

export class TranscriptProviderError extends Error {
  code: TranscriptErrorCode;
  constructor(code: TranscriptErrorCode, message: string) {
    super(message);
    this.name = 'TranscriptProviderError';
    this.code = code;
  }
}

interface ClientIdentity {
  name: string;
  clientName: string;
  clientVersion: string;
  userAgent: string;
  apiKey?: string;
}

const CLIENTS: ClientIdentity[] = [
  {
    name: 'Android',
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    userAgent:
      'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US; Pixel 8 Pro Build/UD1A.231105.004) gzip',
    apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
  },
  {
    name: 'Web',
    clientName: 'WEB',
    clientVersion: '2.20250326.00.00',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  },
  {
    name: 'iOS',
    clientName: 'IOS',
    clientVersion: '20.10.4',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
    apiKey: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
  },
];

const NAMED_HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);|&#39;/g,
      (entity) => NAMED_HTML_ENTITIES[entity] ?? entity,
    );
}

interface PageData {
  apiKey: string;
  clientVersion: string;
  visitorData: string;
}

async function scrapeWatchPage(videoId: string, signal?: AbortSignal): Promise<PageData> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  let html: string;
  try {
    const resp = await fetch(url, { headers, redirect: 'follow', signal });
    html = await resp.text();
  } catch (err) {
    throw new TranscriptProviderError('PAGE_FETCH_FAILED', `Failed to fetch YouTube page: ${err}`);
  }

  if (html.includes('action="https://consent.youtube.com/s"')) {
    const consentMatch = html.match(/name="v" value="(.*?)"/);
    if (consentMatch) {
      try {
        const resp2 = await fetch(url, {
          headers: { ...headers, Cookie: `CONSENT=YES+${consentMatch[1]}` },
          redirect: 'follow',
          signal,
        });
        html = await resp2.text();
      } catch {
        // continue with original html
      }
    }
  }

  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
  const clientVersionMatch = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/);
  const visitorDataMatch = html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/);

  if (!apiKeyMatch) {
    if (html.includes('"playabilityStatus":{"status":"ERROR"')) {
      throw new TranscriptProviderError('VIDEO_UNAVAILABLE', 'Video is unavailable');
    }
    if (html.includes('Sign in to confirm your age') || html.includes('"LOGIN_REQUIRED"')) {
      throw new TranscriptProviderError('AGE_RESTRICTED', 'Video is age-restricted');
    }
    throw new TranscriptProviderError('PAGE_FETCH_FAILED', 'Could not extract INNERTUBE_API_KEY');
  }

  return {
    apiKey: apiKeyMatch[1],
    clientVersion: clientVersionMatch?.[1] || '2.20250326.00.00',
    visitorData: visitorDataMatch?.[1] || '',
  };
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: string;
  kind?: string;
}

async function fetchInnerTubePlayer(
  videoId: string,
  client: ClientIdentity,
  pageData: PageData | null,
  signal?: AbortSignal,
): Promise<CaptionTrack[]> {
  const apiKey = client.apiKey || pageData?.apiKey;
  if (!apiKey) {
    throw new TranscriptProviderError('PAGE_FETCH_FAILED', `No API key for ${client.name}`);
  }
  const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
  const body: Record<string, unknown> = {
    videoId,
    context: {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        userAgent: client.userAgent,
        hl: 'en',
        gl: 'US',
        ...(pageData?.visitorData ? { visitorData: pageData.visitorData } : {}),
      },
    },
  };
  if (client.clientName === 'ANDROID' || client.clientName === 'IOS') {
    body.contentCheckOk = true;
    body.racyCheckOk = true;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': client.userAgent },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new TranscriptProviderError('INNERTUBE_REJECTED', `${client.name} request failed: ${err}`);
  }

  if (response.status === 429) {
    throw new TranscriptProviderError('IP_BLOCKED', `Rate limited (429) on ${client.name}`);
  }
  if (!response.ok) {
    throw new TranscriptProviderError(
      'INNERTUBE_REJECTED',
      `InnerTube returned ${response.status} for ${client.name}`,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new TranscriptProviderError('INNERTUBE_REJECTED', `Invalid JSON from ${client.name}`);
  }

  const playabilityStatus = data.playabilityStatus as Record<string, unknown> | undefined;
  if (playabilityStatus) {
    const status = playabilityStatus.status as string;
    if (status === 'ERROR' || status === 'UNPLAYABLE') {
      throw new TranscriptProviderError('VIDEO_UNAVAILABLE', `Video is ${status.toLowerCase()}`);
    }
    if (status === 'LOGIN_REQUIRED') {
      const reason = (playabilityStatus.reason as string) || '';
      if (reason.includes('age') || reason.includes('Sign in')) {
        throw new TranscriptProviderError('AGE_RESTRICTED', 'Video is age-restricted');
      }
      throw new TranscriptProviderError('BOT_DETECTED', `Login required: ${reason}`);
    }
  }

  const captions = data.captions as Record<string, unknown> | undefined;
  const tracklistRenderer = captions?.playerCaptionsTracklistRenderer as
    | Record<string, unknown>
    | undefined;
  const captionTracks = tracklistRenderer?.captionTracks as
    | Array<Record<string, unknown>>
    | undefined;
  if (!captionTracks?.length) {
    throw new TranscriptProviderError('TRANSCRIPTS_DISABLED', 'No caption tracks');
  }

  return captionTracks
    .filter((t) => typeof t.baseUrl === 'string' && typeof t.languageCode === 'string')
    .map((t) => {
      const nameObj = t.name as Record<string, unknown> | undefined;
      let name = 'Unknown';
      if (nameObj) {
        if (typeof nameObj.simpleText === 'string') name = nameObj.simpleText;
        else if (Array.isArray(nameObj.runs))
          name = (nameObj.runs as Array<{ text?: string }>).map((r) => r.text || '').join('');
      }
      return {
        baseUrl: t.baseUrl as string,
        languageCode: t.languageCode as string,
        kind: typeof t.kind === 'string' ? t.kind : undefined,
        name,
      };
    });
}

function parseCaptionXml(xml: string): { text: string; start: number; duration: number }[] {
  const segments: { text: string; start: number; duration: number }[] = [];
  const clean = (raw: string) =>
    decodeHtmlEntities(raw.replace(/<[^>]*>/g, '').replace(/\n/g, ' ')).trim();

  const pRegex = /<p\s+t="([^"]*)"(?:\s+d="([^"]*)")?[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  let foundP = false;
  while ((m = pRegex.exec(xml)) !== null) {
    foundP = true;
    const start = (parseFloat(m[1]) || 0) / 1000;
    const duration = (parseFloat(m[2]) || 0) / 1000;
    const text = clean(m[3] || '');
    if (text) segments.push({ text, start, duration });
  }
  if (foundP) return segments;

  const textRegex = /<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
  while ((m = textRegex.exec(xml)) !== null) {
    const start = parseFloat(m[1]) || 0;
    const duration = parseFloat(m[2]) || 0;
    const text = clean(m[3] || '');
    if (text) segments.push({ text, start, duration });
  }
  return segments;
}

async function fetchCaptionTrack(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<{ text: string; start: number; duration: number }[]> {
  const url = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=3`;
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal,
  });
  if (!response.ok) {
    throw new TranscriptProviderError(
      'CAPTION_FETCH_FAILED',
      `Caption track returned ${response.status}`,
    );
  }
  const xml = await response.text();
  return parseCaptionXml(xml);
}

function selectBestTrack(tracks: CaptionTrack[], preferred?: string): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const manual = tracks.filter((t) => t.kind !== 'asr');
  const auto = tracks.filter((t) => t.kind === 'asr');
  const findByLang = (list: CaptionTrack[], lang: string) =>
    list.find((t) => t.languageCode === lang) ||
    list.find((t) => t.languageCode.startsWith(lang.split('-')[0]));
  if (preferred) {
    const m = findByLang(manual, preferred) ?? findByLang(auto, preferred);
    if (m) return m;
  }
  if (manual.length) return findByLang(manual, 'en') || manual[0];
  if (auto.length) return findByLang(auto, 'en') || auto[0];
  return tracks[0];
}

function shouldTryNextClient(error: TranscriptProviderError): boolean {
  switch (error.code) {
    case 'BOT_DETECTED':
    case 'IP_BLOCKED':
    case 'INNERTUBE_REJECTED':
    case 'PAGE_FETCH_FAILED':
      return true;
    case 'VIDEO_UNAVAILABLE':
    case 'AGE_RESTRICTED':
    case 'TRANSCRIPTS_DISABLED':
    case 'NO_TRANSCRIPT':
      return false;
    default:
      return true;
  }
}

export async function fetchYouTubeTranscript(
  videoId: string,
  preferredLanguage?: string,
  signal?: AbortSignal,
): Promise<TranscriptFetchResult | null> {
  let pageData: PageData | null = null;
  try {
    pageData = await scrapeWatchPage(videoId, signal);
  } catch {
    // fall through; Android/iOS have hardcoded keys
  }

  let lastError: TranscriptProviderError | null = null;
  for (const client of CLIENTS) {
    if (client.clientName === 'WEB' && !pageData?.apiKey) continue;
    try {
      const captionTracks = await fetchInnerTubePlayer(videoId, client, pageData, signal);
      const selectedTrack = selectBestTrack(captionTracks, preferredLanguage);
      if (!selectedTrack) {
        lastError = new TranscriptProviderError('NO_TRANSCRIPT', 'No suitable caption track');
        continue;
      }
      const segments = await fetchCaptionTrack(selectedTrack.baseUrl, signal);
      if (!segments.length) {
        lastError = new TranscriptProviderError('CAPTION_FETCH_FAILED', 'Empty caption track');
        continue;
      }
      const availableLanguages = [...new Set(captionTracks.map((t) => t.languageCode))];
      return { segments, language: selectedTrack.languageCode, availableLanguages };
    } catch (err) {
      if (err instanceof TranscriptProviderError) {
        lastError = err;
        if (!shouldTryNextClient(err)) return null;
      } else {
        lastError = new TranscriptProviderError('UNKNOWN', String(err));
      }
    }
  }
  if (lastError) {
    console.warn(`[YT-TRANSCRIPT] all clients failed: ${lastError.code} ${lastError.message}`);
  }
  return null;
}

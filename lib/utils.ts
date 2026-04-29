import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').split('/')[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = url.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = url.pathname.match(/\/(shorts|embed|v|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

export function buildVideoSlug(
  title: string | null | undefined,
  videoId: string | null | undefined,
): string {
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return '';

  const normalizedTitle = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  return `${normalizedTitle || 'video'}-${videoId}`;
}

export function extractVideoIdFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const cleaned = slug.trim().replace(/\/+$/, '');
  if (/^[A-Za-z0-9_-]{11}$/.test(cleaned)) return cleaned;
  const potentialId = cleaned.slice(-11);
  return /^[A-Za-z0-9_-]{11}$/.test(potentialId) ? potentialId : null;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTopicDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 sec';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const TOPIC_HUE_OFFSETS = [0, 50, 100, 160, 210, 260, 310, 25, 75, 130];

export function getTopicHSLColor(index: number): string {
  const hue = TOPIC_HUE_OFFSETS[index % TOPIC_HUE_OFFSETS.length];
  return `hsl(${hue}, 70%, 55%)`;
}

export function getTopicColor(index: number): string {
  return getTopicHSLColor(index);
}

export function resolveAppUrl(fallbackOrigin?: string) {
  const isVercelPreview = process.env.VERCEL_ENV === 'preview';
  const vercelUrl = process.env.VERCEL_URL;

  if (isVercelPreview) {
    if (fallbackOrigin) return fallbackOrigin;
    if (vercelUrl) return `https://${vercelUrl}`;
  }

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) {
    if (fallbackOrigin) return fallbackOrigin;
    if (vercelUrl) return `https://${vercelUrl}`;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return '';
  }
  return configuredUrl.replace(/\/+$/, '');
}

export function youtubeThumbnail(videoId: string, quality: 'maxres' | 'hq' = 'maxres'): string {
  const file = quality === 'maxres' ? 'maxresdefault.jpg' : 'hqdefault.jpg';
  return `https://i.ytimg.com/vi/${videoId}/${file}`;
}

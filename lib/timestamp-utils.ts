export function parseTimestamp(label: string): number | null {
  if (!label) return null;
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(label.trim());
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const c = m[3] ? parseInt(m[3], 10) : null;
  if (c !== null) return a * 3600 + b * 60 + c;
  return a * 60 + b;
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export const STRICT_TIMESTAMP_RANGE_REGEX =
  /^\[(?:\d+:)?\d{1,2}:\d{2}-(?:\d+:)?\d{1,2}:\d{2}\]$/;

export function parseTimestampRange(label: string): { start: number; end: number } | null {
  if (!label) return null;
  const trimmed = label.trim();
  const unwrapped = trimmed.replace(/^\[/, '').replace(/\]$/, '');
  const parts = unwrapped.split(/-|–|—| to /i).map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const start = parseTimestamp(parts[0]);
  const end = parseTimestamp(parts[1]);
  if (start === null || end === null || end < start) return null;
  return { start, end };
}

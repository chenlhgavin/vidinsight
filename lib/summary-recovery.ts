import { parseTimestamp } from '@/lib/timestamp-utils';
import type { TranscriptSegment } from '@/lib/types';

export interface RecoveredTakeaway {
  label: string;
  insight: string;
  timestamps?: { label?: string; time: number }[];
}

const MAX_TAKEAWAYS = 6;
const MIN_RECOVERED = 4;
const MAX_TIMESTAMPS_PER_ITEM = 2;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeTimestampValue(value: unknown): { label?: string; time: number } | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { time: Math.max(0, Math.floor(value)) };
  }
  if (typeof value === 'string') {
    const t = parseTimestamp(value);
    if (t !== null) return { label: value, time: t };
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return { time: Math.max(0, Math.floor(numeric)) };
    return null;
  }
  if (value && typeof value === 'object') {
    const obj = value as { time?: unknown; label?: unknown; timestamp?: unknown };
    let time: number | null = null;
    if (typeof obj.time === 'number' && Number.isFinite(obj.time)) {
      time = Math.max(0, Math.floor(obj.time));
    } else if (typeof obj.time === 'string') {
      time = parseTimestamp(obj.time);
    } else if (typeof obj.timestamp === 'string') {
      time = parseTimestamp(obj.timestamp);
    }
    if (time === null) return null;
    const label = typeof obj.label === 'string' ? obj.label : undefined;
    return { time, label };
  }
  return null;
}

function dedupeTimestamps(values: unknown[]): { label?: string; time: number }[] {
  const seen = new Set<number>();
  const out: { label?: string; time: number }[] = [];
  for (const v of values) {
    const norm = normalizeTimestampValue(v);
    if (!norm) continue;
    if (seen.has(norm.time)) continue;
    seen.add(norm.time);
    out.push(norm);
    if (out.length >= MAX_TIMESTAMPS_PER_ITEM) break;
  }
  return out;
}

export function normalizeTakeawaysPayload(payload: unknown): RecoveredTakeaway[] {
  const candidateArray: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { takeaways?: unknown[] })?.takeaways)
      ? (payload as { takeaways: unknown[] }).takeaways
      : Array.isArray((payload as { items?: unknown[] })?.items)
        ? (payload as { items: unknown[] }).items
        : [];

  const normalized: RecoveredTakeaway[] = [];

  for (const raw of candidateArray) {
    let item = raw;
    if (typeof item === 'string') {
      try {
        item = JSON.parse(item);
      } catch {
        continue;
      }
    }
    if (!item || typeof item !== 'object') continue;

    const obj = item as Record<string, unknown>;
    const label = (asString(obj.label) || asString(obj.title)).trim();
    const insight = (asString(obj.insight) || asString(obj.summary) || asString(obj.description)).trim();

    const timestampSources: unknown[] = [];
    if (Array.isArray(obj.timestamps)) timestampSources.push(...(obj.timestamps as unknown[]));
    if (typeof obj.timestamp === 'string') timestampSources.push(obj.timestamp);
    if (typeof obj.time === 'string' || typeof obj.time === 'number') timestampSources.push(obj.time);

    const timestamps = dedupeTimestamps(timestampSources);
    if (!label || !insight) continue;

    normalized.push({ label, insight, timestamps: timestamps.length ? timestamps : undefined });
    if (normalized.length === MAX_TAKEAWAYS) break;
  }

  return normalized;
}

export function recoverPartialTakeaways(raw: string): RecoveredTakeaway[] | null {
  if (!raw) return null;
  const collected: RecoveredTakeaway[] = [];

  // Try double-encoded array of JSON strings first
  try {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.includes('\\"label\\"')) {
      const outer = JSON.parse(trimmed) as unknown[];
      if (Array.isArray(outer)) {
        for (const entry of outer) {
          if (typeof entry !== 'string') continue;
          try {
            const parsed = JSON.parse(entry);
            const norm = normalizeTakeawaysPayload([parsed]);
            collected.push(...norm);
            if (collected.length >= MAX_TAKEAWAYS) break;
          } catch {
            continue;
          }
        }
        if (collected.length >= MIN_RECOVERED) return collected.slice(0, MAX_TAKEAWAYS);
      }
    }
  } catch {
    // fall through
  }

  // Regex-based recovery for truncated/malformed JSON
  const objectPattern =
    /\{\s*"label"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"insight"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"timestamps"\s*:\s*\[(.*?)\]\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = objectPattern.exec(raw)) !== null) {
    try {
      const labelRaw = match[1];
      const insightRaw = match[2];
      const timestampsStr = match[3];
      const label = JSON.parse(`"${labelRaw}"`).trim();
      const insight = JSON.parse(`"${insightRaw}"`).trim();
      if (!label || !insight) continue;

      // Parse timestamps from inside [...]
      let parsedTimestamps: unknown[] = [];
      try {
        parsedTimestamps = JSON.parse(`[${timestampsStr}]`);
      } catch {
        const stringMatches = timestampsStr.match(/"([^"]+)"/g);
        if (stringMatches) parsedTimestamps = stringMatches.map((s) => s.replace(/"/g, ''));
      }
      const timestamps = dedupeTimestamps(parsedTimestamps);

      collected.push({ label, insight, timestamps: timestamps.length ? timestamps : undefined });
      if (collected.length >= MAX_TAKEAWAYS) break;
    } catch {
      continue;
    }
  }

  return collected.length >= MIN_RECOVERED ? collected.slice(0, MAX_TAKEAWAYS) : null;
}

/**
 * Stage-3 fallback: split the transcript into 6 evenly-spaced sections and emit
 * a takeaway per section using the first 220 chars of joined text. Always returns
 * exactly 6 entries when transcript has any segments.
 */
export function buildMinimalTakeawaysFallback(transcript: TranscriptSegment[]): RecoveredTakeaway[] {
  if (!transcript.length) return [];
  const sections = 6;
  const chunkSize = Math.ceil(transcript.length / sections);
  const out: RecoveredTakeaway[] = [];
  for (let i = 0; i < sections; i++) {
    const start = i * chunkSize;
    const end = Math.min(transcript.length, start + chunkSize);
    if (start >= end) break;
    const slice = transcript.slice(start, end);
    const startTime = Math.max(0, Math.floor(slice[0].start));
    const text =
      slice
        .map((s) => s.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220) + '…';
    out.push({
      label: `Section ${i + 1}`,
      insight: text,
      timestamps: [{ time: startTime }],
    });
  }
  return out;
}

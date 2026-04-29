import type { TranscriptSegment, VideoInfo } from '@/lib/types';
import { getLanguageName } from '@/lib/language-utils';

const MAX_TRANSCRIPT_CHARS = 80_000;

export function transcriptToText(segments: TranscriptSegment[]): string {
  let chars = 0;
  const lines: string[] = [];
  for (const s of segments) {
    const ts = formatStamp(s.start);
    const line = `[${ts}] ${s.text}`;
    if (chars + line.length > MAX_TRANSCRIPT_CHARS) {
      lines.push(`[truncated after ${ts}]`);
      break;
    }
    lines.push(line);
    chars += line.length + 1;
  }
  return lines.join('\n');
}

export function formatStamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function buildContextHeader(info?: VideoInfo, language?: string): string {
  const parts: string[] = [];
  if (info?.title) parts.push(`Video title: ${info.title}`);
  if (info?.author) parts.push(`Channel: ${info.author}`);
  if (language) parts.push(`Output language: ${getLanguageName(language)} (${language})`);
  return parts.join('\n');
}

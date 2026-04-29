import type { VideoInfo } from '@/lib/types';
import { buildContextHeader } from './index';

export function buildQuickPreviewPrompt({
  transcriptExcerpt,
  videoInfo,
  language,
}: {
  transcriptExcerpt: string;
  videoInfo?: VideoInfo;
  language?: string;
}): string {
  const tags = videoInfo?.tags?.length ? `\nTags: ${videoInfo.tags.join(', ')}` : '';
  const description = videoInfo?.description ? `\nDescription: ${videoInfo.description}` : '';
  return `Produce a fast, useful preview so the user immediately understands what this video is about.

${buildContextHeader(videoInfo, language)}${tags}${description}

Write a compact structured preview:
- title: an 8-word-or-shorter framing of the video
- summary: 2-3 concise sentences that mention the central topic or tension first
- glance: 3-5 ultra-short bullets with concrete things the user can expect

Return only this JSON object:
{ "preview": { "title": "string", "summary": "string", "glance": ["string"] } }

Transcript excerpt:
${transcriptExcerpt}`;
}

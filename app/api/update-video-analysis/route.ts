import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { extractVideoId } from '@/lib/utils';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';

const ALLOWED_FIELDS = new Set([
  'topics',
  'topic_candidates',
  'summary',
  'top_quotes',
  'suggested_questions',
  'quick_preview',
  'source_language',
  'available_languages',
  'model_used',
]);

export const POST = withSecurity(SECURITY_PRESETS.PUBLIC_LARGE, async (_request, ctx) => {
  const body = (ctx.parsedBody ?? null) as
    | (Record<string, unknown> & { videoId?: string })
    | null;
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const youtubeId = extractVideoId((body.videoId as string) || '');
  if (!youtubeId) return NextResponse.json({ error: 'invalid videoId' }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of Object.keys(body)) {
    if (k === 'videoId') continue;
    if (ALLOWED_FIELDS.has(k)) update[k] = body[k];
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('video_analyses')
    .update(update)
    .eq('youtube_id', youtubeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

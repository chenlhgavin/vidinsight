import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { buildVideoSlug, extractVideoId } from '@/lib/utils';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';

interface SavePayload {
  videoId?: string;
  title?: string;
  author?: string;
  duration?: number | null;
  thumbnailUrl?: string;
  transcript?: unknown;
  topics?: unknown;
  topicCandidates?: unknown;
  summary?: unknown;
  topQuotes?: unknown;
  suggestedQuestions?: unknown;
  quickPreview?: unknown;
  sourceLanguage?: string;
  availableLanguages?: string[];
  modelUsed?: string;
}

export const POST = withSecurity(SECURITY_PRESETS.PUBLIC_LARGE, async (_request, ctx) => {
  const user = ctx.user;
  const body = (ctx.parsedBody ?? null) as SavePayload | null;
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const youtubeId = extractVideoId(body.videoId || '');
  if (!youtubeId) return NextResponse.json({ error: 'invalid videoId' }, { status: 400 });

  const supabase = createServiceRoleClient();
  const slug = buildVideoSlug(body.title, youtubeId);
  const row: Record<string, unknown> = {
    youtube_id: youtubeId,
    slug: slug || null,
    updated_at: new Date().toISOString(),
  };
  if ('title' in body) row.title = body.title ?? null;
  if ('author' in body) row.author = body.author ?? null;
  if ('duration' in body) row.duration = body.duration ?? null;
  if ('thumbnailUrl' in body) row.thumbnail_url = body.thumbnailUrl ?? null;
  if ('transcript' in body) row.transcript = body.transcript ?? null;
  if ('topics' in body) row.topics = body.topics ?? null;
  if ('topicCandidates' in body) row.topic_candidates = body.topicCandidates ?? null;
  if ('summary' in body) row.summary = body.summary ?? null;
  if ('topQuotes' in body) row.top_quotes = body.topQuotes ?? null;
  if ('suggestedQuestions' in body) row.suggested_questions = body.suggestedQuestions ?? null;
  if ('quickPreview' in body) row.quick_preview = body.quickPreview ?? null;
  if ('sourceLanguage' in body) row.source_language = body.sourceLanguage ?? null;
  if ('availableLanguages' in body) row.available_languages = body.availableLanguages ?? null;
  if ('modelUsed' in body) row.model_used = body.modelUsed ?? null;

  const { data, error } = await supabase
    .from('video_analyses')
    .upsert(row, { onConflict: 'youtube_id' })
    .select('id, youtube_id, slug, created_by')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let linked = false;
  const videoDbId = data.id as string;
  if (user) {
    await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? '',
        full_name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      },
      { onConflict: 'id' },
    );

    if (!data.created_by) {
      await supabase
        .from('video_analyses')
        .update({ created_by: user.id })
        .eq('id', videoDbId);
    }

    const { error: linkError } = await supabase.from('user_videos').upsert(
      {
        user_id: user.id,
        video_id: videoDbId,
        accessed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,video_id' },
    );
    linked = !linkError;
  }

  return NextResponse.json({ ok: true, video: data, linked, slug: data.slug ?? slug ?? null });
});

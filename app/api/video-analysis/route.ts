import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { generateTopics } from '@/lib/ai-processing';
import { buildVideoSlug, extractVideoId } from '@/lib/utils';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import type { SecurityContext } from '@/lib/security-middleware';
import { gateGuestForGeneration, finalizeGuestResponse } from '@/lib/guest-gate';
import { recordGuestUsage } from '@/lib/guest-usage';
import type { TopicCandidate, TranscriptSegment, VideoInfo } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withSecurity(SECURITY_PRESETS.PUBLIC, async (request) => {
  const { searchParams } = new URL(request.url);
  const youtubeId = searchParams.get('youtubeId');
  if (!youtubeId) return NextResponse.json({ error: 'missing youtubeId' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('video_analyses')
    .select('*')
    .eq('youtube_id', youtubeId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ analysis: data });
});

async function linkVideoToUser({
  supabase,
  ctx,
  videoId,
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  ctx: SecurityContext;
  videoId: string;
}) {
  const user = ctx.user;
  if (!user) return false;

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

  const { error } = await supabase.from('user_videos').upsert(
    {
      user_id: user.id,
      video_id: videoId,
      accessed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,video_id' },
  );

  return !error;
}

export const POST = withSecurity(SECURITY_PRESETS.AI_GENERATION, async (request, ctx) => {
  const body = (ctx.parsedBody ?? null) as
    | {
        videoId?: string;
        transcript?: TranscriptSegment[];
        videoInfo?: Partial<VideoInfo>;
        includeCandidatePool?: boolean;
        excludeTopicKeys?: string[];
        forceRegenerate?: boolean;
      }
    | null;

  if (!body?.transcript || !Array.isArray(body.transcript)) {
    return NextResponse.json({ error: 'missing transcript' }, { status: 400 });
  }

  const youtubeId = extractVideoId(body.videoId || body.videoInfo?.videoId || '');
  if (!youtubeId) return NextResponse.json({ error: 'invalid videoId' }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { data: cachedVideo } = await supabase
    .from('video_analyses')
    .select('id, youtube_id, title, author, duration, thumbnail_url, topics, topic_candidates, model_used, slug')
    .eq('youtube_id', youtubeId)
    .maybeSingle();

  const isCachedHit =
    !body.forceRegenerate && Array.isArray(cachedVideo?.topics) && cachedVideo.topics.length > 0;

  const gate = await gateGuestForGeneration(request, ctx, {
    isPrimaryAnalysis: true,
    isCachedHit,
  });
  if (!gate.ok) return gate.response;

  if (isCachedHit && cachedVideo) {
    const slug =
      (cachedVideo.slug as string | null) ||
      buildVideoSlug(cachedVideo.title as string | null, youtubeId);
    if (slug && !cachedVideo.slug) {
      await supabase.from('video_analyses').update({ slug }).eq('id', cachedVideo.id as string);
    }
    await linkVideoToUser({ supabase, ctx, videoId: cachedVideo.id as string });
    const response = NextResponse.json({
      topics: cachedVideo.topics,
      topicCandidates: cachedVideo.topic_candidates ?? [],
      modelUsed: cachedVideo.model_used ?? null,
      cached: true,
      videoDbId: cachedVideo.id,
      slug,
    });
    return finalizeGuestResponse(response, gate.guestState, { consumed: false });
  }

  try {
    const videoInfo = {
      videoId: youtubeId,
      title: body.videoInfo?.title ?? `YouTube ${youtubeId}`,
      author: body.videoInfo?.author ?? '',
      thumbnail: body.videoInfo?.thumbnail ?? '',
      duration: body.videoInfo?.duration ?? null,
      description: body.videoInfo?.description,
      tags: body.videoInfo?.tags,
      language: body.videoInfo?.language,
      availableLanguages: body.videoInfo?.availableLanguages,
    } satisfies VideoInfo;

    const generated = await generateTopics({
      transcript: body.transcript,
      videoInfo,
      language: videoInfo.language,
      includeCandidatePool: body.includeCandidatePool ?? true,
      excludeTopicKeys: body.excludeTopicKeys,
      mode: 'smart',
      signal: request.signal,
    });

    const slug = buildVideoSlug(videoInfo.title, youtubeId);
    const row: Record<string, unknown> = {
      youtube_id: youtubeId,
      slug: slug || null,
      title: videoInfo.title,
      author: videoInfo.author || null,
      duration: videoInfo.duration ?? null,
      thumbnail_url: videoInfo.thumbnail || null,
      transcript: body.transcript,
      topics: generated.topics,
      topic_candidates: generated.topicCandidates ?? [],
      source_language: videoInfo.language ?? null,
      available_languages: videoInfo.availableLanguages ?? null,
      model_used: generated.modelUsed,
      updated_at: new Date().toISOString(),
    };
    if (ctx.user) row.created_by = ctx.user.id;

    const { data, error } = await supabase
      .from('video_analyses')
      .upsert(row, { onConflict: 'youtube_id' })
      .select('id, youtube_id, slug, created_by')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await linkVideoToUser({ supabase, ctx, videoId: data.id as string });

    if (gate.guestState) {
      await recordGuestUsage(gate.guestState);
    }

    const response = NextResponse.json({
      topics: generated.topics,
      topicCandidates: (generated.topicCandidates ?? []) as TopicCandidate[],
      modelUsed: generated.modelUsed,
      cached: false,
      videoDbId: data.id,
      slug: data.slug ?? slug ?? null,
    });
    return finalizeGuestResponse(response, gate.guestState, { consumed: !!gate.guestState });
  } catch (err) {
    console.error('[video-analysis:POST]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
});

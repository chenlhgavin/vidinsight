import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { extractVideoId } from '@/lib/utils';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';

export const POST = withSecurity(SECURITY_PRESETS.AUTHENTICATED, async (_request, ctx) => {
  const user = ctx.user!;
  const body = ctx.parsedBody as { videoId?: string; isFavorite?: boolean } | null;
  const youtubeId = extractVideoId(body?.videoId || '');
  if (!youtubeId) return NextResponse.json({ error: 'invalid videoId' }, { status: 400 });

  const admin = createServiceRoleClient();
  await admin.from('profiles').upsert(
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

  const { data: video } = await admin
    .from('video_analyses')
    .select('id')
    .eq('youtube_id', youtubeId)
    .maybeSingle();
  if (!video) return NextResponse.json({ error: 'video_not_found' }, { status: 404 });

  const videoDbId = video.id as string;
  const { data: existing } = await admin
    .from('user_videos')
    .select('id, is_favorite')
    .eq('user_id', user.id)
    .eq('video_id', videoDbId)
    .maybeSingle();

  const next =
    typeof body?.isFavorite === 'boolean'
      ? body.isFavorite
      : !((existing?.is_favorite as boolean | undefined) ?? false);
  if (existing) {
    await admin
      .from('user_videos')
      .update({ is_favorite: next, accessed_at: new Date().toISOString() })
      .eq('id', existing.id as string);
  } else {
    await admin
      .from('user_videos')
      .insert({
        user_id: user.id,
        video_id: videoDbId,
        is_favorite: next,
        accessed_at: new Date().toISOString(),
      });
  }
  return NextResponse.json({ success: true, favorite: next, isFavorite: next });
});

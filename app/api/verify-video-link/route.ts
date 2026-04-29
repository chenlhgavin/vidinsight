import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';

export const GET = withSecurity(SECURITY_PRESETS.AUTHENTICATED_READ_ONLY, async (request, ctx) => {
  const user = ctx.user!;
  const { searchParams } = new URL(request.url);
  const youtubeId = searchParams.get('youtubeId');
  if (!youtubeId) return NextResponse.json({ linked: false }, { status: 400 });

  const admin = createServiceRoleClient();
  const { data: video } = await admin
    .from('video_analyses')
    .select('id')
    .eq('youtube_id', youtubeId)
    .maybeSingle();
  if (!video) return NextResponse.json({ linked: false });

  const { data: link } = await admin
    .from('user_videos')
    .select('id, is_favorite')
    .eq('user_id', user.id)
    .eq('video_id', video.id as string)
    .maybeSingle();

  return NextResponse.json({
    linked: !!link,
    isFavorite: Boolean(link?.is_favorite),
    videoDbId: video.id,
  });
});

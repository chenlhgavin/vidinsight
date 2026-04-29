import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { buildVideoSlug, extractVideoId } from '@/lib/utils';
import { withSecurity, SECURITY_PRESETS, type SecurityContext } from '@/lib/security-middleware';

export const runtime = 'nodejs';

async function handler(request: Request, ctx: SecurityContext) {
  const { searchParams } = new URL(request.url);
  const body = (ctx.parsedBody ?? null) as
    | { youtubeId?: string; videoId?: string; url?: string }
    | null;
  const candidate =
    request.method === 'GET'
      ? searchParams.get('youtubeId') || searchParams.get('videoId') || searchParams.get('url') || ''
      : body?.youtubeId || body?.videoId || body?.url || '';
  const youtubeId = extractVideoId(candidate);
  if (!youtubeId) return NextResponse.json({ cached: false, error: 'invalid videoId' }, { status: 400 });

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('video_analyses')
    .select('id, youtube_id, title, author, thumbnail_url, duration, updated_at, slug')
    .eq('youtube_id', youtubeId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ cached: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ cached: false, video: null });

  const slug = (data.slug as string | null) || buildVideoSlug(data.title as string | null, youtubeId);
  if (slug && !data.slug) {
    await admin.from('video_analyses').update({ slug }).eq('id', data.id as string);
    data.slug = slug;
  }

  let linked = false;
  let isFavorite = false;
  const user = ctx.user;
  if (user) {
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

    const { data: link } = await admin
      .from('user_videos')
      .upsert(
        {
          user_id: user.id,
          video_id: data.id,
          accessed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,video_id' },
      )
      .select('id, is_favorite')
      .single();

    linked = Boolean(link);
    isFavorite = Boolean(link?.is_favorite);
  }

  return NextResponse.json({
    cached: true,
    video: data,
    videoDbId: data.id,
    slug: data.slug ?? slug ?? null,
    linked,
    isFavorite,
  });
}

export const GET = withSecurity(SECURITY_PRESETS.PUBLIC, handler);
export const POST = withSecurity(SECURITY_PRESETS.PUBLIC, handler);

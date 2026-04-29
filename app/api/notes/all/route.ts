import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { NoteWithVideo } from '@/lib/types';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';

interface JoinedRow {
  id: string;
  user_id: string;
  video_id: string;
  source: NoteWithVideo['source'];
  source_id: string | null;
  text: string;
  metadata: NoteWithVideo['metadata'];
  created_at: string;
  updated_at: string;
  video_analyses: {
    youtube_id: string;
    title: string;
    author: string;
    thumbnail_url: string;
    duration: number | null;
    slug: string | null;
  } | null;
}

export const GET = withSecurity(SECURITY_PRESETS.AUTHENTICATED_READ_ONLY, async (_request, ctx) => {
  const user = ctx.user!;
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('user_notes')
    .select(
      'id, user_id, video_id, source, source_id, text, metadata, created_at, updated_at, video_analyses ( youtube_id, title, author, thumbnail_url, duration, slug )',
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notes: NoteWithVideo[] = ((data as JoinedRow[] | null) ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    videoId: row.video_id,
    source: row.source,
    sourceId: row.source_id,
    text: row.text,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    video: row.video_analyses
      ? {
          youtubeId: row.video_analyses.youtube_id,
          title: row.video_analyses.title,
          author: row.video_analyses.author,
          thumbnailUrl: row.video_analyses.thumbnail_url,
          duration: row.video_analyses.duration,
          slug: row.video_analyses.slug,
        }
      : null,
  }));

  return NextResponse.json({ notes });
});

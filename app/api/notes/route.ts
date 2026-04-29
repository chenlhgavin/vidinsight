import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { Note, NoteMetadata, NoteSource } from '@/lib/types';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';

const VALID_SOURCES: NoteSource[] = ['chat', 'takeaways', 'transcript', 'custom'];

interface DbNoteRow {
  id: string;
  user_id: string;
  video_id: string;
  source: NoteSource;
  source_id: string | null;
  text: string;
  metadata: NoteMetadata | null;
  created_at: string;
  updated_at: string;
}

function rowToNote(row: DbNoteRow): Note {
  return {
    id: row.id,
    userId: row.user_id,
    videoId: row.video_id,
    source: row.source,
    sourceId: row.source_id,
    text: row.text,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const GET = withSecurity(SECURITY_PRESETS.AUTHENTICATED_READ_ONLY, async (request, ctx) => {
  const user = ctx.user!;
  const { searchParams } = new URL(request.url);
  const youtubeId = searchParams.get('youtubeId');
  if (!youtubeId) return NextResponse.json({ error: 'missing youtubeId' }, { status: 400 });

  const admin = createServiceRoleClient();
  const { data: video } = await admin
    .from('video_analyses')
    .select('id')
    .eq('youtube_id', youtubeId)
    .maybeSingle();
  if (!video) return NextResponse.json({ notes: [] });

  const { data, error } = await admin
    .from('user_notes')
    .select('*')
    .eq('user_id', user.id)
    .eq('video_id', video.id as string)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: (data as unknown as DbNoteRow[] | null)?.map(rowToNote) ?? [] });
});

export const POST = withSecurity(SECURITY_PRESETS.AUTHENTICATED, async (_request, ctx) => {
  const user = ctx.user!;
  const body = (ctx.parsedBody ?? null) as
    | {
        youtubeId?: string;
        videoId?: string;
        source?: NoteSource;
        sourceId?: string;
        text?: string;
        metadata?: NoteMetadata;
      }
    | null;
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  if (!body.text || body.text.length > 16_000) {
    return NextResponse.json({ error: 'invalid text' }, { status: 400 });
  }
  if (!body.source || !VALID_SOURCES.includes(body.source)) {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 });
  }

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

  let videoDbId = body.videoId ?? null;
  if (!videoDbId && body.youtubeId) {
    const { data: video } = await admin
      .from('video_analyses')
      .select('id')
      .eq('youtube_id', body.youtubeId)
      .maybeSingle();
    videoDbId = (video?.id as string | undefined) ?? null;
  }
  if (!videoDbId) return NextResponse.json({ error: 'video_not_found' }, { status: 404 });

  await admin.from('user_videos').upsert(
    {
      user_id: user.id,
      video_id: videoDbId,
      accessed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,video_id' },
  );

  const { data, error } = await admin
    .from('user_notes')
    .insert({
      user_id: user.id,
      video_id: videoDbId,
      source: body.source,
      source_id: body.sourceId ?? null,
      text: body.text,
      metadata: body.metadata ?? null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: rowToNote(data as unknown as DbNoteRow) });
});

export const DELETE = withSecurity(SECURITY_PRESETS.AUTHENTICATED, async (request, ctx) => {
  const user = ctx.user!;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('user_notes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

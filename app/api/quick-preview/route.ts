import { NextResponse } from 'next/server';
import { generateQuickPreview } from '@/lib/ai-processing';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { gateGuestForGeneration, finalizeGuestResponse } from '@/lib/guest-gate';
import type { VideoInfo } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = withSecurity(SECURITY_PRESETS.AI_GENERATION, async (request, ctx) => {
  const gate = await gateGuestForGeneration(request, ctx, { isPrimaryAnalysis: false });
  if (!gate.ok) return gate.response;

  const body = ctx.parsedBody as Record<string, unknown> | null;
  if (!body?.transcript)
    return NextResponse.json({ error: 'missing transcript' }, { status: 400 });
  try {
    const incomingInfo =
      body.videoInfo && typeof body.videoInfo === 'object'
        ? (body.videoInfo as Partial<VideoInfo>)
        : {};
    const videoInfo = {
      ...incomingInfo,
      videoId: incomingInfo.videoId ?? '',
      title:
        incomingInfo.title ??
        ((body.videoTitle as string | undefined) || 'Untitled video'),
      author:
        incomingInfo.author ??
        ((body.channelName as string | undefined) || ''),
      thumbnail: incomingInfo.thumbnail ?? '',
      duration: incomingInfo.duration ?? null,
      description:
        incomingInfo.description ??
        (body.videoDescription as string | undefined),
      tags:
        incomingInfo.tags ??
        (Array.isArray(body.tags) ? (body.tags as string[]) : undefined),
    } satisfies VideoInfo;
    const result = await generateQuickPreview({
      transcript: body.transcript as never,
      videoInfo,
      language: ((body.targetLanguage as string) || (body.language as string)) ?? undefined,
      signal: request.signal,
    });
    return finalizeGuestResponse(NextResponse.json(result), gate.guestState, { consumed: false });
  } catch (err) {
    console.error('[quick-preview]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
});

import { NextResponse } from 'next/server';
import { generateSummary } from '@/lib/ai-processing';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { gateGuestForGeneration, finalizeGuestResponse } from '@/lib/guest-gate';
import type { TranscriptSegment, VideoInfo } from '@/lib/types';

export const runtime = 'nodejs';

interface SummaryArgs {
  transcript: TranscriptSegment[];
  videoInfo?: VideoInfo;
  language?: string;
  signal?: AbortSignal;
}

export const POST = withSecurity(SECURITY_PRESETS.AI_GENERATION, async (request, ctx) => {
  const gate = await gateGuestForGeneration(request, ctx, { isPrimaryAnalysis: false });
  if (!gate.ok) return gate.response;

  const body = ctx.parsedBody as Record<string, unknown> | null;
  if (!body?.transcript || !Array.isArray(body.transcript)) {
    return NextResponse.json({ error: 'missing transcript' }, { status: 400 });
  }
  const args: SummaryArgs = {
    transcript: body.transcript as TranscriptSegment[],
    videoInfo: body.videoInfo as VideoInfo | undefined,
    language: ((body.targetLanguage as string) || (body.language as string)) ?? undefined,
    signal: request.signal,
  };

  try {
    const result = await generateSummary(args);
    return finalizeGuestResponse(NextResponse.json(result), gate.guestState, { consumed: false });
  } catch (err) {
    console.warn('[generate-summary] failed:', (err as Error).message);
    return finalizeGuestResponse(
      NextResponse.json({ takeaways: [], error: 'summary_unavailable' }, { status: 200 }),
      gate.guestState,
      { consumed: false },
    );
  }
});

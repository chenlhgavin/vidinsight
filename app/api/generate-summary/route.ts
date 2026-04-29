import { NextResponse } from 'next/server';
import { generateSummary } from '@/lib/ai-processing';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { gateGuestForGeneration, finalizeGuestResponse } from '@/lib/guest-gate';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withSecurity(SECURITY_PRESETS.AI_GENERATION, async (request, ctx) => {
  const gate = await gateGuestForGeneration(request, ctx, { isPrimaryAnalysis: false });
  if (!gate.ok) return gate.response;

  const body = ctx.parsedBody as Record<string, unknown> | null;
  if (!body?.transcript)
    return NextResponse.json({ error: 'missing transcript' }, { status: 400 });
  try {
    const result = await generateSummary({
      transcript: body.transcript as never,
      videoInfo: body.videoInfo as never,
      language: ((body.targetLanguage as string) || (body.language as string)) ?? undefined,
      signal: request.signal,
    });
    return finalizeGuestResponse(NextResponse.json(result), gate.guestState, { consumed: false });
  } catch (err) {
    console.error('[generate-summary]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
});

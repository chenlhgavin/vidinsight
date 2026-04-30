import { NextResponse } from 'next/server';
import { generateQuestions } from '@/lib/ai-processing';
import { buildSuggestedQuestionFallbacks } from '@/lib/suggested-question-fallback';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { gateGuestForGeneration, finalizeGuestResponse } from '@/lib/guest-gate';

export const runtime = 'nodejs';

export const POST = withSecurity(SECURITY_PRESETS.AI_GENERATION, async (request, ctx) => {
  const gate = await gateGuestForGeneration(request, ctx, { isPrimaryAnalysis: false });
  if (!gate.ok) return gate.response;

  const body = ctx.parsedBody as Record<string, unknown> | null;
  if (!body?.transcript)
    return NextResponse.json({ error: 'missing transcript' }, { status: 400 });
  const count = (body.count as number | undefined) ?? 5;
  const exclude = body.exclude as string[] | undefined;
  try {
    const result = await generateQuestions({
      transcript: body.transcript as never,
      videoInfo: body.videoInfo as never,
      topics: body.topics as never,
      count,
      exclude,
      language: ((body.targetLanguage as string) || (body.language as string)) ?? undefined,
      signal: request.signal,
    });
    if (!result.questions?.length) {
      const fallback = buildSuggestedQuestionFallbacks(count, exclude);
      return finalizeGuestResponse(
        NextResponse.json({ questions: fallback }),
        gate.guestState,
        { consumed: false },
      );
    }
    return finalizeGuestResponse(NextResponse.json(result), gate.guestState, { consumed: false });
  } catch (err) {
    console.warn('[suggested-questions] falling back:', (err as Error).message);
    const fallback = buildSuggestedQuestionFallbacks(count, exclude);
    return finalizeGuestResponse(
      NextResponse.json({ questions: fallback }),
      gate.guestState,
      { consumed: false },
    );
  }
});

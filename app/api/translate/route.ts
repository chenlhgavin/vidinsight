import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTranslationClient } from '@/lib/translation';
import type { TranslationContext, TranslationScenario } from '@/lib/types';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

export const runtime = 'nodejs';

const translationContextSchema = z
  .object({
    scenario: z.enum(['transcript', 'chat', 'topic', 'general']).optional(),
    videoTitle: z.string().optional(),
    videoDescription: z.string().optional(),
    videoTags: z.array(z.string()).optional(),
    topicKeywords: z.array(z.string()).optional(),
    preserveFormatting: z.boolean().optional(),
  })
  .optional() satisfies z.ZodType<TranslationContext | undefined>;

const translateRequestSchema = z.object({
  texts: z.array(z.string()),
  targetLanguage: z.string().min(1).optional(),
  context: translationContextSchema,
  // Legacy VidInsight protocol. New callers should use targetLanguage/context.
  target: z.string().min(1).optional(),
  scenario: z.enum(['transcript', 'chat', 'topic', 'general']).optional(),
});

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export const POST = withSecurity(SECURITY_PRESETS.AUTHENTICATED, async (_request, ctx) => {
  const validation = translateRequestSchema.safeParse(ctx.parsedBody ?? null);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'invalid request format', details: validation.error.flatten() },
      { status: 400 },
    );
  }

  const { texts, targetLanguage, target, scenario } = validation.data;
  if (!texts.length) return NextResponse.json({ translations: [] });

  const resolvedTargetLanguage = targetLanguage ?? target;
  if (!resolvedTargetLanguage) {
    return NextResponse.json({ error: 'missing targetLanguage' }, { status: 400 });
  }
  const targetLanguageForRequest: string = resolvedTargetLanguage;

  const MAX_REQUEST_TEXTS = 10_000;
  if (texts.length > MAX_REQUEST_TEXTS) {
    return NextResponse.json(
      { error: `batch size too large. Maximum ${MAX_REQUEST_TEXTS} texts allowed.` },
      { status: 400 },
    );
  }

  const context: TranslationContext = {
    ...(validation.data.context ?? {}),
    ...(scenario ? { scenario: scenario as TranslationScenario } : {}),
  };

  try {
    const translationClient = getTranslationClient();
    const chunks = chunk(texts, 100);
    const translations = new Array<string>(texts.length);
    let nextChunkIndex = 0;

    async function worker() {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));

      while (nextChunkIndex < chunks.length) {
        const currentChunkIndex = nextChunkIndex++;
        const translated = await translationClient.translateBatch(
          chunks[currentChunkIndex],
          targetLanguageForRequest,
          context,
        );
        const start = currentChunkIndex * 100;
        for (let i = 0; i < translated.length; i++) {
          translations[start + i] = translated[i];
        }
      }
    }

    const workers = Array.from({ length: Math.min(6, chunks.length) }, () => worker());
    await Promise.all(workers);

    return NextResponse.json({ translations });
  } catch (err) {
    console.error('[translate]', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    if (err instanceof Error && /quota|limit|429/i.test(err.message)) {
      return NextResponse.json({ error: 'translation service quota exceeded' }, { status: 429 });
    }

    return NextResponse.json({ error: 'translation failed' }, { status: 500 });
  }
});

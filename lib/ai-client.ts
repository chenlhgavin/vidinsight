import type { z } from 'zod';
import { generateWithFallback } from '@/lib/ai-providers/registry';
import type { ProviderGenerateParams, ProviderGenerateResult } from '@/lib/ai-providers/types';

export type GenerateOptions = Omit<ProviderGenerateParams, 'prompt' | 'zodSchema'> & {
  provider?: string;
};
export type GenerateResultOptions<T = unknown> = Omit<ProviderGenerateParams<T>, 'prompt'> & {
  provider?: string;
};

export async function generateAIResponse(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const result = await generateWithFallback({ prompt, ...opts });
  return result.text;
}

export async function generateAIResult<T = unknown>(
  prompt: string,
  opts: GenerateResultOptions<T> = {},
): Promise<ProviderGenerateResult<T>> {
  return generateWithFallback<T>({ prompt, ...opts });
}

export async function generateStructuredContent<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts: GenerateOptions = {},
): Promise<T> {
  const result = await generateWithFallback<T>({ prompt, ...opts, zodSchema: schema });
  if (!result.parsed) throw new Error('schema validation succeeded but parsed missing');
  return result.parsed;
}

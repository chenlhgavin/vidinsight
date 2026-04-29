import type { TranslationContext, TranslationScenario } from '@/lib/types';

export type { TranslationScenario, TranslationContext };

export interface TranslationProvider {
  translate(text: string, targetLanguage: string, context?: TranslationContext): Promise<string>;
  translateBatch(
    texts: string[],
    targetLanguage: string,
    context?: TranslationContext,
  ): Promise<string[]>;
}

export interface TranslationRequest {
  texts: string[];
  targetLanguage: string;
  context?: TranslationContext;
}

export interface TranslationResponse {
  translations: string[];
}

export interface TranslationError extends Error {
  code?: string;
  details?: unknown;
}

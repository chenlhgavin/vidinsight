import { LLMTranslateClient } from './llm-translate-client';
import type { TranslationProvider } from './types';

let translationClient: TranslationProvider | null = null;

export function getTranslationClient(): TranslationProvider {
  if (!translationClient) {
    const temperature = process.env.TRANSLATION_LLM_TEMPERATURE
      ? parseFloat(process.env.TRANSLATION_LLM_TEMPERATURE)
      : undefined;

    translationClient = new LLMTranslateClient({ temperature });
    console.log(
      `[translation] LLM client initialized (temperature: ${temperature ?? 0.3})`,
    );
  }

  return translationClient;
}

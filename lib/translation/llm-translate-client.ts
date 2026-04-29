import { generateAIResponse } from '@/lib/ai-client';
import { getLanguageName } from '@/lib/language-utils';
import type {
  TranslationContext,
  TranslationProvider,
  TranslationRequest,
  TranslationResponse,
  TranslationScenario,
} from './types';

const TRANSLATION_DELIMITER = '<<<TRANSLATION>>>';

interface TranslationResult {
  translations: (string | null)[];
  successCount: number;
  failedIndices: number[];
}

export class LLMTranslateClient implements TranslationProvider {
  private readonly temperature: number;

  constructor(options: { temperature?: number } = {}) {
    this.temperature = options.temperature ?? 0.3;
  }

  async translate(
    text: string,
    targetLanguage: string,
    context?: TranslationContext,
  ): Promise<string> {
    const results = await this.translateBatch([text], targetLanguage, context);
    return results[0] ?? text;
  }

  async translateBatch(
    texts: string[],
    targetLanguage: string,
    context?: TranslationContext,
  ): Promise<string[]> {
    if (!texts.length) return [];

    const maxBatchSize = 35;
    if (texts.length > maxBatchSize) {
      const chunks: string[][] = [];
      for (let i = 0; i < texts.length; i += maxBatchSize) {
        chunks.push(texts.slice(i, i + maxBatchSize));
      }

      const results = await Promise.all(
        chunks.map((chunk) => this.translateBatchInternal(chunk, targetLanguage, context)),
      );
      return results.flat();
    }

    return this.translateBatchInternal(texts, targetLanguage, context);
  }

  private async translateBatchInternal(
    texts: string[],
    targetLanguage: string,
    context?: TranslationContext,
    attempt = 1,
  ): Promise<string[]> {
    const maxRetries = 2;
    const prompt = this.buildIndexedPrompt(texts, targetLanguage, context);

    try {
      const response = await generateAIResponse(prompt, {
        temperature: this.temperature,
        maxOutputTokens: 16_384,
        metadata: {
          operation: 'translation',
          scenario: context?.scenario ?? 'general',
          targetLanguage,
          textCount: texts.length,
          attempt,
          format: 'indexed',
        },
      });

      let result = this.parseIndexedResponse(response, texts.length);

      if (result.successCount === 0) {
        const legacyTranslations = this.parseLineDelimitedResponse(response, texts.length);
        if (legacyTranslations.length > 0) {
          result = {
            translations: legacyTranslations.map((translation) => translation || null),
            successCount: legacyTranslations.filter(Boolean).length,
            failedIndices: legacyTranslations
              .map((translation, index) => (translation ? -1 : index))
              .filter((index) => index >= 0),
          };
        }
      }

      if (result.successCount === texts.length) {
        return result.translations as string[];
      }

      const successRate = result.successCount / texts.length;
      if (result.successCount === 0 && attempt <= maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        return this.translateBatchInternal(texts, targetLanguage, context, attempt + 1);
      }

      if (
        successRate < 0.9 &&
        attempt <= maxRetries &&
        result.failedIndices.length > 0 &&
        result.failedIndices.length <= 10
      ) {
        const failedTexts = result.failedIndices.map((index) => texts[index]);
        try {
          const retriedTranslations = await this.translateBatchInternal(
            failedTexts,
            targetLanguage,
            context,
            attempt + 1,
          );

          retriedTranslations.forEach((translation, retriedIndex) => {
            const originalIndex = result.failedIndices[retriedIndex];
            result.translations[originalIndex] = translation;
          });
        } catch {
          // Fall back to originals for items that still fail after targeted retry.
        }
      }

      return result.translations.map((translation, index) => translation ?? texts[index]);
    } catch (error) {
      if (attempt <= maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        return this.translateBatchInternal(texts, targetLanguage, context, attempt + 1);
      }

      console.error('[translation] LLM translation failed', {
        message: error instanceof Error ? error.message : String(error),
        textsCount: texts.length,
        scenario: context?.scenario ?? 'general',
      });
      return texts;
    }
  }

  private parseIndexedResponse(response: string, expectedCount: number): TranslationResult {
    const translations: (string | null)[] = new Array(expectedCount).fill(null);
    const pattern = /\[OUTPUT_(\d+)\]([\s\S]*?)\[\/OUTPUT_\1\]/g;
    let match: RegExpExecArray | null;
    let successCount = 0;

    while ((match = pattern.exec(response)) !== null) {
      const index = parseInt(match[1], 10);
      const content = match[2].trim();
      if (index >= 0 && index < expectedCount && translations[index] === null) {
        translations[index] = content;
        successCount++;
      }
    }

    const failedIndices: number[] = [];
    for (let i = 0; i < expectedCount; i++) {
      if (translations[i] === null) failedIndices.push(i);
    }

    return { translations, successCount, failedIndices };
  }

  private parseLineDelimitedResponse(response: string, expectedCount: number): string[] {
    const translations = response
      .split(TRANSLATION_DELIMITER)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (translations.length === expectedCount) return translations;

    const doubleNewline = response
      .split('\n\n')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.includes('TRANSLATION'));
    if (doubleNewline.length === expectedCount) return doubleNewline;

    const singleLines = response
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          !line.includes('TRANSLATION') &&
          !line.startsWith('TEXT ') &&
          !line.match(/^\d+\.?\s*$/),
      );
    if (singleLines.length === expectedCount) return singleLines;

    return translations;
  }

  private buildIndexedPrompt(
    texts: string[],
    targetLanguage: string,
    context?: TranslationContext,
  ): string {
    const scenario = context?.scenario ?? 'general';
    const systemInstructions = this.getSystemInstructions(scenario, context);
    const languageName = getLanguageName(targetLanguage);
    const textsList = texts
      .map((text, index) => `[INPUT_${index}]\n${text}\n[/INPUT_${index}]`)
      .join('\n\n');

    return `${systemInstructions}

TARGET LANGUAGE: ${languageName}

TRANSLATE EXACTLY ${texts.length} TEXTS BELOW.

${textsList}

OUTPUT FORMAT REQUIREMENTS:
1. For each input, output: [OUTPUT_N] then the translation, then [/OUTPUT_N]
2. N must match the input index (0 to ${texts.length - 1})
3. Output ALL ${texts.length} translations in numerical order
4. Do NOT add explanations, labels, or extra content
5. For empty inputs, output empty content between tags

EXAMPLE OUTPUT FORMAT:
[OUTPUT_0]
First translated text here
[/OUTPUT_0]
[OUTPUT_1]
Second translated text here
[/OUTPUT_1]

NOW OUTPUT ALL ${texts.length} TRANSLATIONS:`;
  }

  private getSystemInstructions(
    scenario: TranslationScenario,
    context?: TranslationContext,
  ): string {
    const baseInstructions = `You are an expert linguist and translator specializing in converting spoken content into natural, native-sounding text.

CORE PRINCIPLES:
- Translate the meaning and intent, not just isolated words
- Use natural, fluent, and idiomatic language in the target language
- Preserve code snippets, URLs, timestamps, citation markers, and specific proper nouns exactly as needed
- Keep markdown, line breaks, bullets, and lightweight formatting intact`;

    return `${baseInstructions}

${this.getScenarioInstructions(scenario, context)}`;
  }

  private getScenarioInstructions(
    scenario: TranslationScenario,
    context?: TranslationContext,
  ): string {
    switch (scenario) {
      case 'transcript':
        return `SCENARIO: Video Transcript Translation
${context?.videoTitle ? `VIDEO TITLE: "${context.videoTitle}"\n` : ''}
GUIDELINES:
- Make the translation sound like a native speaker talking naturally.
- Remove obvious filler words and false starts when they hurt readability.
- Use video context to correct obvious speech-to-text mistakes.
- Translate technical terms to their standard local equivalents unless the English term is the industry standard.
- Preserve paragraph breaks, speaker changes, numbers, timestamps, and named entities.`;

      case 'chat':
        return `SCENARIO: Chat Message Translation
${context?.videoTitle ? `VIDEO TITLE: "${context.videoTitle}"\n` : ''}
GUIDELINES:
- Maintain conversational tone and personality.
- Preserve markdown formatting, links, code blocks, and inline code.
- Keep citations and references intact, including [1], [2], [1:23], and timestamp-like markers.
- Preserve URLs and technical identifiers unchanged.
- Use video context to understand domain-specific terms.`;

      case 'topic':
        return `SCENARIO: Topic/Highlight Translation
${context?.videoTitle ? `VIDEO TITLE: "${context.videoTitle}"\n` : ''}${context?.topicKeywords?.length ? `TOPIC KEYWORDS: ${context.topicKeywords.join(', ')}\n` : ''}
GUIDELINES:
- Translate topic titles to be concise, clear, and engaging.
- Preserve important technical keywords and product names.
- Keep quote translations faithful to the speaker's intent.
- Maintain an educational, informative tone.
- Use video context to resolve domain-specific terms.`;

      case 'general':
      default:
        return `SCENARIO: General Translation
GUIDELINES:
- Provide accurate, natural translation.
- Preserve technical terms and proper nouns when appropriate.
- Maintain original formatting and overall tone.`;
    }
  }
}

export async function translateWithContext(
  texts: string[],
  targetLanguage: string,
  context: TranslationContext,
  client?: LLMTranslateClient,
): Promise<string[]> {
  const translationClient = client ?? new LLMTranslateClient();
  return translationClient.translateBatch(texts, targetLanguage, context);
}

export async function translateBatch(req: TranslationRequest): Promise<TranslationResponse> {
  const translationClient = new LLMTranslateClient();
  return {
    translations: await translationClient.translateBatch(
      req.texts,
      req.targetLanguage,
      req.context,
    ),
  };
}

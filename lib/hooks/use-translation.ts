'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TranslationBatcher } from '@/lib/translation-batcher';
import type { TranslationContext, TranslationScenario } from '@/lib/translation/types';
import type { VideoInfo } from '@/lib/types';

export function useTranslation() {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [translationCache] = useState<Map<string, string>>(new Map());
  const translationBatcherRef = useRef<TranslationBatcher | null>(null);
  const errorShownRef = useRef(false);

  const getBatcher = useCallback(() => {
    if (!translationBatcherRef.current) {
      translationBatcherRef.current = new TranslationBatcher(
        20,
        1000,
        translationCache,
        3,
        0,
        (error, isRateLimitError) => {
          if (errorShownRef.current) return;
          errorShownRef.current = true;

          toast.error(isRateLimitError ? 'Translation rate limit exceeded' : 'Translation failed', {
            description: isRateLimitError
              ? 'Please wait a moment and try again. Some translations may show the original text.'
              : 'Unable to translate some content. Showing original text.',
            duration: 5000,
          });

          setTimeout(() => {
            errorShownRef.current = false;
          }, 10_000);
        },
      );
    }

    return translationBatcherRef.current;
  }, [translationCache]);

  const handleRequestTranslation = useCallback(
    async (
      text: string,
      cacheKey: string,
      scenario?: TranslationScenario,
      videoInfo?: VideoInfo | null,
      targetLanguage?: string,
    ): Promise<string> => {
      const langToUse = targetLanguage ?? selectedLanguage;
      if (!langToUse || !text.trim()) return text;

      const context: TranslationContext = {
        scenario: scenario ?? 'general',
        videoTitle: videoInfo?.title ?? undefined,
        videoDescription: videoInfo?.description ?? undefined,
        topicKeywords:
          Array.isArray(videoInfo?.tags) && videoInfo.tags.length > 0
            ? videoInfo.tags
            : undefined,
      };

      const translation = await getBatcher().translate(text, cacheKey, langToUse, context);

      const maxCacheSize = 500;
      if (translationCache.size > maxCacheSize) {
        const firstKey = translationCache.keys().next().value;
        if (firstKey !== undefined) translationCache.delete(firstKey);
      }

      return translation;
    },
    [getBatcher, selectedLanguage, translationCache],
  );

  const handleLanguageChange = useCallback((languageCode: string | null) => {
    setSelectedLanguage(languageCode);

    if (translationBatcherRef.current && !languageCode) {
      translationBatcherRef.current.clear();
      translationBatcherRef.current = null;
    } else if (translationBatcherRef.current) {
      translationBatcherRef.current.clearPending();
    }
  }, []);

  return {
    selectedLanguage,
    translationCache,
    handleRequestTranslation,
    handleLanguageChange,
  };
}

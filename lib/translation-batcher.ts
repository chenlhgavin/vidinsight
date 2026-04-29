import { csrfFetch } from '@/lib/csrf-client';
import type { TranslationContext } from '@/lib/translation/types';

interface TranslationRequest {
  text: string;
  cacheKey: string;
  targetLanguage: string;
  context?: TranslationContext;
  resolve: (translation: string) => void;
  reject: (error: Error) => void;
}

interface TranslationGroup {
  targetLanguage: string;
  context?: TranslationContext;
  requests: TranslationRequest[];
}

export class TranslationBatcher {
  private queue: TranslationRequest[] = [];
  private processing = false;
  private scheduledTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly batchDelay: number = 20,
    private readonly maxBatchSize: number = 1000,
    private readonly cache: Map<string, string>,
    private readonly maxRetries: number = 3,
    private readonly batchThrottleMs: number = 0,
    private readonly onError?: (error: Error, isRateLimitError: boolean) => void,
  ) {
    if (maxBatchSize < 1 || maxBatchSize > 10_000) {
      throw new Error('maxBatchSize must be between 1 and 10000');
    }
  }

  translate(
    text: string,
    cacheKey: string,
    targetLanguage: string,
    context?: TranslationContext,
  ): Promise<string> {
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return Promise.resolve(cached);

    return new Promise<string>((resolve, reject) => {
      this.queue.push({ text, cacheKey, targetLanguage, context, resolve, reject });
      this.maybeStartBatch();
    });
  }

  clear(): void {
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    this.queue = [];
  }

  clearPending(): void {
    this.clear();
  }

  getStats() {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      cacheSize: this.cache.size,
      scheduled: this.scheduledTimeout !== null,
    };
  }

  private maybeStartBatch(): void {
    if (this.queue.length >= this.maxBatchSize && !this.processing) {
      void this.processNextBatch();
      return;
    }

    if (this.processing || this.scheduledTimeout) return;

    this.scheduledTimeout = setTimeout(() => {
      this.scheduledTimeout = null;
      void this.processNextBatch();
    }, this.batchDelay);
  }

  private async processNextBatch(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      if (this.scheduledTimeout) {
        clearTimeout(this.scheduledTimeout);
        this.scheduledTimeout = null;
      }

      const batch = this.queue.splice(0, this.maxBatchSize);
      if (!batch.length) return;

      await this.executeBatch(batch);
    } catch (error) {
      console.error('[translation] unexpected batcher error', error);
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        setTimeout(() => void this.processNextBatch(), 0);
      }
    }
  }

  private async executeBatch(batch: TranslationRequest[]): Promise<void> {
    const groups = this.groupRequests(batch);
    let isFirst = true;

    for (const group of groups.values()) {
      if (!isFirst && this.batchThrottleMs > 0) {
        await this.sleep(this.batchThrottleMs);
      }
      isFirst = false;
      await this.translateGroup(group);
    }
  }

  private groupRequests(batch: TranslationRequest[]): Map<string, TranslationGroup> {
    const groups = new Map<string, TranslationGroup>();

    for (const request of batch) {
      const key = this.groupKey(request.targetLanguage, request.context);
      const existing = groups.get(key);
      if (existing) {
        existing.requests.push(request);
      } else {
        groups.set(key, {
          targetLanguage: request.targetLanguage,
          context: request.context,
          requests: [request],
        });
      }
    }

    return groups;
  }

  private groupKey(targetLanguage: string, context?: TranslationContext): string {
    const scenario = context?.scenario ?? 'general';
    const videoTitle = context?.videoTitle ?? '';
    const videoDescription = context?.videoDescription ?? '';
    const topicKeywords = context?.topicKeywords?.join('|') ?? '';
    const preserveFormatting = context?.preserveFormatting ? '1' : '0';
    return JSON.stringify({
      targetLanguage,
      scenario,
      videoTitle,
      videoDescription,
      topicKeywords,
      preserveFormatting,
    });
  }

  private async translateGroup(group: TranslationGroup): Promise<void> {
    const uniqueTexts = Array.from(new Set(group.requests.map((request) => request.text)));
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await csrfFetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: uniqueTexts,
            targetLanguage: group.targetLanguage,
            ...(group.context ? { context: group.context } : {}),
          }),
        });

        if (!response.ok) {
          if (response.status === 429 && attempt < this.maxRetries) {
            const retryAfter = response.headers.get('Retry-After');
            const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
            await this.sleep(this.getBackoffDelay(attempt, retryAfterSeconds));
            continue;
          }
          throw new Error(`Translation API error: ${response.status}`);
        }

        const data = (await response.json()) as { translations?: string[] };
        const translations = Array.isArray(data.translations) ? data.translations : [];
        const translationMap = new Map<string, string>();
        uniqueTexts.forEach((text, index) => {
          translationMap.set(text, translations[index] || text);
        });

        for (const request of group.requests) {
          const translation = translationMap.get(request.text) || request.text;
          this.cache.set(request.cacheKey, translation);
          request.resolve(translation);
        }
        return;
      } catch (error) {
        lastError = error as Error;
        const message = lastError.message.toLowerCase();
        const retryable = message.includes('429') || message.includes('rate limit');
        if (!retryable || attempt === this.maxRetries) break;
        await this.sleep(this.getBackoffDelay(attempt));
      }
    }

    if (lastError && this.onError) {
      const message = lastError.message.toLowerCase();
      this.onError(lastError, message.includes('429') || message.includes('rate limit'));
    }

    for (const request of group.requests) {
      request.resolve(request.text);
    }
  }

  private getBackoffDelay(attempt: number, retryAfter?: number): number {
    if (retryAfter) return retryAfter * 1000;
    return Math.min(1000 * Math.pow(2, attempt), 10_000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

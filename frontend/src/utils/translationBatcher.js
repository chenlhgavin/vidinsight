/**
 * Batches translation requests with deduplication and debouncing.
 *
 * Collects individual text translation requests over a short delay,
 * deduplicates, chunks into manageable batches, and fires the API.
 */
export class TranslationBatcher {
  constructor({ translateFn, onTranslated, batchDelay = 20, maxBatchSize = 100 }) {
    this._translateFn = translateFn;
    this._onTranslated = onTranslated;
    this._batchDelay = batchDelay;
    this._maxBatchSize = maxBatchSize;
    this._pending = new Map(); // text -> { targetLanguage, context }
    this._timer = null;
  }

  request(text, targetLanguage, context = '') {
    const key = `${targetLanguage}:${text}`;
    if (!this._pending.has(key)) {
      this._pending.set(key, { text, targetLanguage, context });
    }
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this._timer !== null) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._flush();
    }, this._batchDelay);
  }

  async _flush() {
    if (this._pending.size === 0) return;

    const entries = [...this._pending.values()];
    this._pending.clear();

    // Group by targetLanguage (typically all the same)
    const groups = new Map();
    for (const entry of entries) {
      const key = entry.targetLanguage;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }

    for (const [targetLanguage, groupEntries] of groups) {
      // Chunk into maxBatchSize
      for (let i = 0; i < groupEntries.length; i += this._maxBatchSize) {
        const chunk = groupEntries.slice(i, i + this._maxBatchSize);
        const texts = chunk.map((e) => e.text);
        const context = chunk[0]?.context || '';

        try {
          const result = await this._translateFn(texts, targetLanguage, context);
          if (result?.translations) {
            const translated = new Map();
            texts.forEach((text, idx) => {
              if (result.translations[idx]) {
                translated.set(`${targetLanguage}:${text}`, result.translations[idx]);
              }
            });
            this._onTranslated(translated);
          }
        } catch (err) {
          console.warn('Translation batch failed:', err);
        }
      }
    }
  }

  destroy() {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._pending.clear();
  }
}

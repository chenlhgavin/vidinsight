'use client';

import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import type { Topic, TranslationRequestHandler } from '@/lib/types';
import { cn, formatTopicDuration, getTopicHSLColor } from '@/lib/utils';

interface Props {
  topic: Topic;
  index: number;
  active?: boolean;
  onPlay: (topic: Topic) => void;
  selectedLanguage?: string | null;
  onRequestTranslation?: TranslationRequestHandler;
}

export function TopicCard({
  topic,
  index,
  active,
  onPlay,
  selectedLanguage = null,
  onRequestTranslation,
}: Props) {
  const color = getTopicHSLColor(index);
  const translationKey = selectedLanguage
    ? `topic-title:${selectedLanguage}:${topic.title}`
    : null;
  const [translationState, setTranslationState] = useState<{
    key: string | null;
    value: string | null;
    loading: boolean;
  }>({ key: null, value: null, loading: false });
  const translatedTitle =
    translationState.key === translationKey ? translationState.value : null;
  const isLoadingTranslation =
    translationState.key === translationKey && translationState.loading;

  useEffect(() => {
    if (!translationKey || !selectedLanguage || !onRequestTranslation || !topic.title.trim()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      setTranslationState({ key: translationKey, value: null, loading: true });

      try {
        const translation = await onRequestTranslation(topic.title, translationKey, 'topic');
        if (!cancelled) {
          setTranslationState({ key: translationKey, value: translation, loading: false });
        }
      } catch {
        if (!cancelled) {
          setTranslationState({ key: translationKey, value: null, loading: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onRequestTranslation, selectedLanguage, topic.title, translationKey]);

  return (
    <button
      type="button"
      onClick={() => onPlay(topic)}
      className={cn(
        'group relative flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-surface-2 p-3 text-left transition-all',
        'hover:-translate-y-0.5 hover:border-surface-4 hover:bg-surface-3',
        active &&
          'border-transparent bg-surface-3 shadow-[0_0_0_1px_hsl(var(--accent-lime)/0.7),0_0_28px_hsl(var(--accent-lime)/0.18)]',
      )}
    >
      <span
        aria-hidden
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-foreground"
        style={{
          background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 35%, transparent))`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12)`,
        }}
      >
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-black drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">
          {String(index + 1).padStart(2, '0')}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="font-mono">{formatTopicDuration(topic.duration)}</span>
        </div>
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {selectedLanguage
            ? isLoadingTranslation
              ? 'Translating...'
              : translatedTitle || topic.title
            : topic.title}
        </p>
        {topic.quote?.text ? (
          <p className="mt-1 line-clamp-2 font-display text-[13px] italic leading-snug text-muted-foreground">
            “{topic.quote.text}”
          </p>
        ) : topic.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{topic.description}</p>
        ) : null}
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-surface-3 text-muted-foreground transition group-hover:bg-lime group-hover:text-primary-foreground">
        <Play className="h-3.5 w-3.5 fill-current" />
      </span>
    </button>
  );
}

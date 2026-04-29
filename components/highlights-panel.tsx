'use client';

import { motion } from 'framer-motion';
import { ListMusic, Play, Loader2, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TopicCard } from '@/components/topic-card';
import { ThemeSelector } from '@/components/theme-selector';
import type { Topic, TranslationRequestHandler } from '@/lib/types';

interface Props {
  topics: Topic[];
  themes: string[];
  selectedTheme: string | null;
  loadingTheme?: boolean;
  activeTopicId?: string | null;
  playingAll?: boolean;
  onSelectTheme: (theme: string | null) => void;
  onPlayTopic: (topic: Topic) => void;
  onPlayAll: () => void;
  onStop?: () => void;
  selectedLanguage?: string | null;
  onRequestTranslation?: TranslationRequestHandler;
}

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};

export function HighlightsPanel({
  topics,
  themes,
  selectedTheme,
  loadingTheme,
  activeTopicId,
  playingAll,
  onSelectTheme,
  onPlayTopic,
  onPlayAll,
  onStop,
  selectedLanguage = null,
  onRequestTranslation,
}: Props) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4 surface-inner">
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <ListMusic className="h-3.5 w-3.5" /> Highlights
          {topics.length ? (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-foreground/80">
              {topics.length}
            </span>
          ) : null}
        </h2>
        <Button
          size="sm"
          variant={playingAll ? 'secondary' : 'accent'}
          onClick={playingAll ? onStop : onPlayAll}
          disabled={!topics.length}
        >
          {playingAll ? (
            <>
              <Pause className="h-3 w-3 fill-current" /> Stop
            </>
          ) : (
            <>
              <Play className="h-3 w-3 fill-current" /> Play all
            </>
          )}
        </Button>
      </header>
      {themes.length > 0 && (
        <ThemeSelector themes={themes} selected={selectedTheme} onSelect={onSelectTheme} />
      )}
      <motion.div
        key={selectedTheme ?? 'all'}
        variants={STAGGER}
        initial="hidden"
        animate="show"
        className="space-y-2"
      >
        {loadingTheme && (
          <div className="flex items-center gap-2 rounded-xl bg-surface-3 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading highlights…
          </div>
        )}
        {topics.map((topic, i) => (
          <motion.div key={topic.id} variants={ITEM}>
            <TopicCard
              topic={topic}
              index={i}
              active={activeTopicId === topic.id}
              onPlay={onPlayTopic}
              selectedLanguage={selectedLanguage}
              onRequestTranslation={onRequestTranslation}
            />
          </motion.div>
        ))}
        {!topics.length && !loadingTheme && (
          <p className="rounded-xl bg-surface-3 px-3 py-4 text-center text-xs text-muted-foreground">
            No highlights yet.
          </p>
        )}
      </motion.div>
    </section>
  );
}

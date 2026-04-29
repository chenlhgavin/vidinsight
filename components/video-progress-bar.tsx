'use client';

import { useRef, type MouseEvent } from 'react';
import type { Topic } from '@/lib/types';
import { cn, formatDuration, getTopicHSLColor } from '@/lib/utils';

interface Props {
  duration: number;
  currentTime: number;
  topics: Topic[];
  onSeek: (time: number) => void;
  selectedTopic?: Topic | null;
  onPlayTopic?: (topic: Topic) => void;
}

export function VideoProgressBar({
  duration,
  currentTime,
  topics,
  onSeek,
  selectedTopic,
  onPlayTopic,
}: Props) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const total = duration > 0 ? duration : Math.max(currentTime, 1);
  const cursorPct = Math.min(100, (currentTime / total) * 100);

  const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-3">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <span>{formatDuration(currentTime)}</span>
        <span>{formatDuration(total)}</span>
      </div>
      <div
        ref={barRef}
        className="relative h-3 w-full cursor-pointer overflow-hidden rounded-full bg-surface-4"
        onClick={handleBackgroundClick}
      >
        {topics.flatMap((t, ti) =>
          t.segments.map((s, si) => {
            if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) return null;
            const left = (s.start / total) * 100;
            const width = Math.max(0.4, ((s.end - s.start) / total) * 100);
            const color = getTopicHSLColor(ti);
            const isSelected = selectedTopic?.id === t.id;
            return (
              <button
                key={`${t.id}-${si}`}
                type="button"
                title={t.title}
                onClick={(event) => {
                  event.stopPropagation();
                  if (onPlayTopic) onPlayTopic(t);
                  else onSeek(s.start);
                }}
                className={cn(
                  'absolute top-0 h-full rounded-full transition-all hover:brightness-125 hover:shadow-[0_0_10px_currentColor]',
                  isSelected && 'z-10 ring-2 ring-foreground/80 brightness-125',
                )}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: color,
                  color,
                  opacity: isSelected ? 1 : 0.82,
                }}
              />
            );
          }),
        )}
        <div
          className="pointer-events-none absolute top-0 h-full w-[2px] bg-lime shadow-[0_0_8px_hsl(var(--accent-lime))]"
          style={{ left: `${cursorPct}%` }}
        />
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Citation, Topic, TranscriptSegment, TranslationRequestHandler, VideoInfo } from '@/lib/types';
import { cn, formatDuration, getTopicHSLColor } from '@/lib/utils';
import { SelectionActions, type SelectionActionPayload } from '@/components/selection-actions';

interface Props {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (t: number) => void;
  onSelection?: (payload: SelectionActionPayload) => void;
  onAskSelection?: (payload: SelectionActionPayload) => void;
  selectedTopic?: Topic | null;
  citationHighlight?: Citation | null;
  topics?: Topic[];
  selectedLanguage?: string | null;
  videoInfo?: VideoInfo | null;
  onRequestTranslation?: TranslationRequestHandler;
}

export function TranscriptViewer({
  segments,
  currentTime,
  onSeek,
  onSelection,
  onAskSelection,
  selectedTopic,
  citationHighlight,
  topics = [],
  selectedLanguage = null,
  onRequestTranslation,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [loadingTranslations, setLoadingTranslations] = useState<Set<number>>(new Set());
  const [translationErrors, setTranslationErrors] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);

  const activeIndex = segments.findIndex(
    (s, i) => currentTime >= s.start && (i === segments.length - 1 || currentTime < segments[i + 1].start),
  );
  const selectedTopicIndex = selectedTopic ? topics.findIndex((t) => t.id === selectedTopic.id) : -1;
  const selectedTopicColor = selectedTopicIndex >= 0 ? getTopicHSLColor(selectedTopicIndex) : null;
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [] as Array<{ segmentIndex: number; startIndex: number; endIndex: number }>;

    const results: Array<{ segmentIndex: number; startIndex: number; endIndex: number }> = [];
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const text = segments[segmentIndex].text.toLowerCase();
      let startIndex = 0;
      let matchIndex = text.indexOf(query, startIndex);
      while (matchIndex !== -1) {
        results.push({
          segmentIndex,
          startIndex: matchIndex,
          endIndex: matchIndex + query.length,
        });
        startIndex = matchIndex + Math.max(1, query.length);
        matchIndex = text.indexOf(query, startIndex);
      }
    }
    return results;
  }, [searchQuery, segments]);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLDivElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex]);

  const effectiveSearchIndex = searchResults.length
    ? Math.min(Math.max(currentSearchIndex, 0), searchResults.length - 1)
    : -1;

  useEffect(() => {
    if (effectiveSearchIndex < 0) return;
    const result = searchResults[effectiveSearchIndex];
    if (!result) return;
    const el = ref.current?.querySelector<HTMLDivElement>(`[data-idx="${result.segmentIndex}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [effectiveSearchIndex, searchResults]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      setTranslations(new Map());
      setTranslationErrors(new Set());

      if (!selectedLanguage || !onRequestTranslation || !segments.length) {
        setLoadingTranslations(new Set());
        return;
      }

      const translatable = segments
        .map((segment, index) => ({ segment, index }))
        .filter(({ segment }) => segment.text.trim().length > 0);

      setLoadingTranslations(new Set(translatable.map(({ index }) => index)));

      translatable.forEach(({ segment, index }) => {
        const cacheKey = `transcript:${index}:${selectedLanguage}:${segment.text}`;
        onRequestTranslation(segment.text, cacheKey, 'transcript')
          .then((translation) => {
            if (cancelled) return;
            setTranslations((prev) => new Map(prev).set(index, translation));
          })
          .catch(() => {
            if (cancelled) return;
            setTranslationErrors((prev) => new Set(prev).add(index));
          })
          .finally(() => {
            if (cancelled) return;
            setLoadingTranslations((prev) => {
              const next = new Set(prev);
              next.delete(index);
              return next;
            });
          });
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [segments, selectedLanguage, onRequestTranslation]);

  const getHighlightedParts = (segment: TranscriptSegment, segmentIndex: number) => {
    const segmentSearchResults = searchResults.filter((result) => result.segmentIndex === segmentIndex);
    if (segmentSearchResults.length) {
      const parts: Array<{ text: string; highlighted: boolean; current?: boolean; source: 'search' }> = [];
      let lastIndex = 0;
      for (const result of segmentSearchResults) {
        if (result.startIndex > lastIndex) {
          parts.push({
            text: segment.text.slice(lastIndex, result.startIndex),
            highlighted: false,
            source: 'search',
          });
        }
        parts.push({
          text: segment.text.slice(result.startIndex, result.endIndex),
          highlighted: true,
          current: searchResults[effectiveSearchIndex] === result,
          source: 'search',
        });
        lastIndex = result.endIndex;
      }
      if (lastIndex < segment.text.length) {
        parts.push({ text: segment.text.slice(lastIndex), highlighted: false, source: 'search' });
      }
      return parts.filter((part) => part.text.length > 0);
    }

    const highlightSegments = citationHighlight ? [citationHighlight] : selectedTopic?.segments ?? [];
    if (!highlightSegments.length) return null;

    const hasIndexedHighlights = highlightSegments.some(
      (h) => h.startSegmentIdx !== undefined && h.endSegmentIdx !== undefined,
    );

    for (const h of highlightSegments) {
      if (h.startSegmentIdx === undefined || h.endSegmentIdx === undefined) continue;
      if (segmentIndex < h.startSegmentIdx || segmentIndex > h.endSegmentIdx) continue;

      const startOffset =
        segmentIndex === h.startSegmentIdx ? Math.max(0, h.startCharOffset ?? 0) : 0;
      const endOffset =
        segmentIndex === h.endSegmentIdx
          ? Math.min(segment.text.length, h.endCharOffset ?? segment.text.length)
          : segment.text.length;

      if (endOffset <= startOffset) continue;

      return [
        { text: segment.text.slice(0, startOffset), highlighted: false, source: 'range' as const },
        { text: segment.text.slice(startOffset, endOffset), highlighted: true, source: 'range' as const },
        { text: segment.text.slice(endOffset), highlighted: false, source: 'range' as const },
      ].filter((part) => part.text.length > 0);
    }

    if (hasIndexedHighlights) return null;

    const segmentEnd = segment.start + segment.duration;
    const shouldHighlight = highlightSegments.some((h) => {
      const overlapStart = Math.max(segment.start, h.start);
      const overlapEnd = Math.min(segmentEnd, h.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      return segment.duration > 0 && overlap / segment.duration > 0.5;
    });

    return shouldHighlight ? [{ text: segment.text, highlighted: true, source: 'range' as const }] : null;
  };

  if (!segments.length) {
    return <p className="px-5 py-5 text-sm text-muted-foreground">Transcript not available yet.</p>;
  }

  return (
    <ScrollArea className="h-full min-h-[520px]">
      <div className="sticky top-0 z-10 border-b border-border bg-surface-2/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-3 px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentSearchIndex(0);
            }}
            placeholder="Search transcript"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          {searchQuery && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {searchResults.length ? effectiveSearchIndex + 1 : 0}/{searchResults.length}
            </span>
          )}
          <button
            type="button"
            title="Previous result"
            disabled={!searchResults.length}
            onClick={() =>
              setCurrentSearchIndex((idx) =>
                searchResults.length ? (idx <= 0 ? searchResults.length - 1 : idx - 1) : -1,
              )
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-4 hover:text-foreground disabled:opacity-40"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Next result"
            disabled={!searchResults.length}
            onClick={() =>
              setCurrentSearchIndex((idx) =>
                searchResults.length ? (idx + 1 >= searchResults.length ? 0 : idx + 1) : -1,
              )
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-4 hover:text-foreground disabled:opacity-40"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {searchQuery && (
            <button
              type="button"
              title="Clear search"
              onClick={() => setSearchQuery('')}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-4 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <SelectionActions
        source="transcript"
        onSaveNote={onSelection}
        onAsk={onAskSelection}
        className="space-y-px px-3 py-4 text-sm leading-7"
        getPayload={(range, text) => {
          const startNode = range.startContainer.parentElement;
          const segmentElement = startNode?.closest<HTMLElement>('[data-idx]');
          const idx = segmentElement?.dataset.idx ? parseInt(segmentElement.dataset.idx, 10) : -1;
          const segment = segments[idx];
          return {
            text,
            source: 'transcript',
            metadata: {
              transcript: segment
                ? {
                    start: segment.start,
                    end: segment.start + segment.duration,
                    segmentIndex: idx,
                    topicId: selectedTopic?.id,
                  }
                : undefined,
              selectedText: text,
              selectionContext: selectedTopic?.title,
              timestampLabel: segment
                ? `${formatDuration(segment.start)} - ${formatDuration(segment.start + segment.duration)}`
                : undefined,
            },
          };
        }}
      >
        <div ref={ref}>
        {segments.map((s, i) => {
          const isActive = i === activeIndex;
          const highlightedParts = getHighlightedParts(s, i);
          const translationEnabled = selectedLanguage !== null;
          const translation = translations.get(i);
          const isLoadingTranslation = loadingTranslations.has(i);
          const hasTranslationError = translationErrors.has(i);
          return (
            <div
              key={i}
              data-idx={i}
              onClick={() => {
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) return;
                onSeek(s.start);
              }}
              className={cn(
                'group/seg cursor-pointer rounded-lg border-l-2 border-transparent px-3 py-1.5 transition-colors',
                isActive ? 'border-lime bg-lime/8' : 'hover:bg-surface-3',
                highlightedParts && !isActive && 'bg-surface-3/70',
              )}
            >
              <p className={isActive ? 'text-foreground' : 'text-foreground/85'}>
                {highlightedParts
                  ? highlightedParts.map((part, partIndex) =>
                      part.highlighted ? (
                        <mark
                          key={partIndex}
                          className="rounded px-0.5 text-foreground"
                          style={{
                            backgroundColor: part.source === 'search'
                              ? part.current
                                ? 'hsl(var(--accent-orange) / 0.38)'
                                : 'hsl(var(--accent-lime) / 0.24)'
                              : citationHighlight
                              ? 'hsl(var(--accent-orange) / 0.28)'
                              : selectedTopicColor
                                ? `${selectedTopicColor.replace('hsl(', 'hsla(').replace(')', ', 0.24)')}`
                                : 'hsl(var(--accent-lime) / 0.22)',
                          }}
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={partIndex}>{part.text}</span>
                      ),
                    )
                  : s.text}
              </p>
              {translationEnabled && (
                <p
                  className={cn(
                    'mt-1 text-sm leading-6',
                    isActive ? 'text-foreground/90' : 'text-muted-foreground',
                  )}
                >
                  {isLoadingTranslation ? (
                    <span className="italic text-muted-foreground/70">Translating...</span>
                  ) : hasTranslationError ? (
	                    <button
	                      type="button"
	                      onClick={(event) => {
	                        event.stopPropagation();
	                        if (!onRequestTranslation || !selectedLanguage) return;
	                        setTranslationErrors((prev) => {
	                          const next = new Set(prev);
	                          next.delete(i);
                          return next;
	                        });
	                        setLoadingTranslations((prev) => new Set(prev).add(i));
	                        void onRequestTranslation(
	                          s.text,
	                          `transcript:${i}:${selectedLanguage}:${s.text}`,
	                          'transcript',
                        )
                          .then((translated) => {
                            setTranslations((prev) => new Map(prev).set(i, translated));
                          })
                          .catch(() => {
                            setTranslationErrors((prev) => new Set(prev).add(i));
                          })
                          .finally(() => {
                            setLoadingTranslations((prev) => {
                              const next = new Set(prev);
                              next.delete(i);
                              return next;
                            });
                          });
                      }}
                      className="text-xs font-semibold text-orange underline underline-offset-2"
                    >
                      Translation failed. Retry
                    </button>
                  ) : (
                    translation ?? s.text
                  )}
                </p>
              )}
            </div>
          );
        })}
        </div>
      </SelectionActions>
    </ScrollArea>
  );
}

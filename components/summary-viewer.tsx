'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookmarkPlus, Loader2 } from 'lucide-react';
import type { SummaryTakeaway } from '@/lib/types';
import { formatDuration } from '@/lib/utils';

interface Props {
  takeaways: SummaryTakeaway[];
  loading?: boolean;
  onSeek: (t: number) => void;
  onSaveNote?: (takeaway: SummaryTakeaway) => void;
}

export function SummaryViewer({ takeaways, loading, onSeek, onSaveNote }: Props) {
  if (loading && !takeaways.length) {
    return (
      <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-lime" />
        Generating summary…
      </div>
    );
  }
  if (!takeaways.length) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">No takeaways yet.</p>;
  }
  return (
    <div className="space-y-4 px-5 py-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Key takeaways
      </h3>
      <ol className="space-y-3">
        {takeaways.map((t, i) => (
          <li
            key={i}
            className="group flex gap-3 rounded-xl border border-border bg-surface-3 p-4 transition hover:border-surface-4"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime text-xs font-bold text-primary-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.label}
                </p>
                {onSaveNote && (
                  <button
                    type="button"
                    title="Save as note"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-surface-4 hover:text-foreground group-hover:opacity-100"
                    onClick={() => onSaveNote(t)}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="prose prose-sm prose-invert mt-1 max-w-none text-sm leading-6 text-foreground/90">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.insight}</ReactMarkdown>
              </div>
              {t.timestamps?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.timestamps.map((ts, k) => (
                    <button
                      key={k}
                      onClick={() => onSeek(ts.time)}
                      className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground transition hover:border-lime hover:text-foreground"
                    >
                      {ts.label ?? formatDuration(ts.time)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

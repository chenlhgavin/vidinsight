'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Play, User as UserIcon, Sparkles } from 'lucide-react';
import type { ChatMessage, Citation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SelectionActions, type SelectionActionPayload } from '@/components/selection-actions';

interface Props {
  message: ChatMessage;
  onSeek: (t: number) => void;
  onPlayCitation?: (citation: Citation) => void;
  onPlayCitations?: (citations: Citation[]) => void;
  onSaveSelectionNote?: (payload: SelectionActionPayload) => void;
  onAskSelection?: (payload: SelectionActionPayload) => void;
}

export function ChatMessageView({
  message,
  onSeek,
  onPlayCitation,
  onPlayCitations,
  onSaveSelectionNote,
  onAskSelection,
}: Props) {
  const { content, citations = [], role } = message;
  const selectionMetadata = {
    chat: {
      messageId: message.id,
      role,
      timestamp: message.timestamp?.toISOString(),
    },
  };

  if (role === 'user') {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <SelectionActions
          source="chat"
          sourceId={message.id}
          metadata={selectionMetadata}
          onSaveNote={onSaveSelectionNote}
          onAsk={onAskSelection}
          className="max-w-[88%] rounded-2xl rounded-tr-md border border-lime/20 bg-lime/12 px-3.5 py-2.5 text-sm leading-relaxed text-foreground"
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </SelectionActions>
        <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 text-foreground/70">
          <UserIcon className="h-3.5 w-3.5" />
        </span>
      </div>
    );
  }

  const renderInline = (raw: string) => {
    const parts = raw.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const m = /^\[(\d+)\]$/.exec(part);
      if (!m) return part;
      const n = parseInt(m[1], 10);
      const c = citations.find((x) => x.number === n);
      if (!c) return part;
      const approximate = (c.confidence ?? 1) < 1;
      return (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (onPlayCitation) onPlayCitation(c);
            else onSeek(c.start);
          }}
          title={c.text}
          className={cn(
            'mx-0.5 inline-flex items-center rounded-full border px-1.5 py-px font-mono text-[10px] font-semibold align-baseline transition',
            approximate
              ? 'border-dashed border-orange text-orange'
              : 'border-lime/40 bg-lime/12 text-lime hover:bg-lime/20',
          )}
        >
          {n}
        </button>
      );
    });
  };

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 text-lime">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <SelectionActions
        source="chat"
        sourceId={message.id}
        metadata={selectionMetadata}
        onSaveNote={onSaveSelectionNote}
        onAsk={onAskSelection}
        className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-surface-3 px-3.5 py-2.5 text-sm leading-relaxed text-foreground"
      >
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="my-1.5 first:mt-0 last:mb-0">
                  {Array.isArray(children)
                    ? children.flatMap((c, i) =>
                        typeof c === 'string' ? renderInline(c) : <span key={i}>{c}</span>,
                      )
                    : typeof children === 'string'
                    ? renderInline(children)
                    : children}
                </p>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
        {citations.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
            <button
              type="button"
              onClick={() => onPlayCitations?.(citations)}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:bg-surface-4"
            >
              <Play className="h-2.5 w-2.5 fill-current" /> Play citations
            </button>
            {citations.map((c) => (
              <button
                key={c.number}
                type="button"
                onClick={() => {
                  if (onPlayCitation) onPlayCitation(c);
                  else onSeek(c.start);
                }}
                className="rounded-full border border-lime/40 bg-lime/12 px-2 py-0.5 font-mono text-[10px] font-semibold text-lime transition hover:bg-lime/20"
                title={c.text}
              >
                {c.number}
              </button>
            ))}
          </div>
        )}
      </SelectionActions>
    </div>
  );
}

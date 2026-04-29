'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { MessageSquareText, NotebookPen } from 'lucide-react';
import type { NoteMetadata, NoteSource } from '@/lib/types';

export interface SelectionActionPayload {
  text: string;
  source: NoteSource;
  sourceId?: string | null;
  metadata?: NoteMetadata | null;
}

interface SelectionActionsProps {
  children: ReactNode;
  source: NoteSource;
  sourceId?: string | null;
  metadata?: NoteMetadata | null;
  className?: string;
  getPayload?: (range: Range, text: string) => SelectionActionPayload;
  onSaveNote?: (payload: SelectionActionPayload) => void;
  onAsk?: (payload: SelectionActionPayload) => void;
}

interface FloatingSelection {
  payload: SelectionActionPayload;
  top: number;
  left: number;
}

export function SelectionActions({
  children,
  source,
  sourceId,
  metadata,
  className,
  getPayload,
  onSaveNote,
  onAsk,
}: SelectionActionsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<FloatingSelection | null>(null);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  const handleMouseUp = useCallback(() => {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || selected.rangeCount === 0) {
      setSelection(null);
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    const anchor = selected.anchorNode;
    const focus = selected.focusNode;
    if (!anchor || !focus || !root.contains(anchor) || !root.contains(focus)) return;

    const text = selected.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const range = selected.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const payload = getPayload
      ? getPayload(range, text)
      : {
          text,
          source,
          sourceId,
          metadata: metadata
            ? {
                ...metadata,
                selectedText: text,
              }
            : { selectedText: text },
        };

    setSelection({
      payload,
      top: Math.max(8, rect.top - 42),
      left: Math.min(window.innerWidth - 160, Math.max(8, rect.left + rect.width / 2 - 80)),
    });
  }, [getPayload, metadata, source, sourceId]);

  return (
    <div ref={rootRef} className={className} onMouseUp={handleMouseUp}>
      {children}
      {selection && (
        <div
          className="fixed z-50 flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1 shadow-lg"
          style={{ top: selection.top, left: selection.left }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {onSaveNote && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-surface-3"
              onClick={() => {
                onSaveNote(selection.payload);
                clearSelection();
              }}
            >
              <NotebookPen className="h-3 w-3" />
              Note
            </button>
          )}
          {onAsk && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-surface-3"
              onClick={() => {
                onAsk(selection.payload);
                clearSelection();
              }}
            >
              <MessageSquareText className="h-3 w-3" />
              Ask
            </button>
          )}
        </div>
      )}
    </div>
  );
}

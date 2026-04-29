'use client';

import { useEffect, useState } from 'react';
import { Trash2, NotebookPen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchNotes,
  saveNote,
  deleteNote,
} from '@/lib/notes-client';
import type { Note } from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';
import { toast } from 'sonner';
import type { SelectionActionPayload } from '@/components/selection-actions';

interface Props {
  videoDbId: string | null;
  youtubeId: string;
  notes: Note[];
  onChange: (notes: Note[]) => void;
  onSeek: (t: number) => void;
  pendingDraft?: SelectionActionPayload | null;
  onDraftConsumed?: () => void;
  onRequestSignIn?: () => void;
}

const SOURCE_COLOR: Record<string, string> = {
  transcript: 'hsl(var(--accent-lime))',
  takeaways: 'hsl(var(--accent-orange))',
  chat: '#7DD3FC',
  custom: '#F472B6',
};

export function NotesPanel({
  videoDbId,
  youtubeId,
  notes,
  onChange,
  onSeek,
  pendingDraft,
  onDraftConsumed,
  onRequestSignIn,
}: Props) {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const [draftSource, setDraftSource] = useState<Note['source']>('custom');
  const [draftSourceId, setDraftSourceId] = useState<string | null>(null);
  const [draftMetadata, setDraftMetadata] = useState<Note['metadata']>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void fetchNotes(youtubeId).then(onChange).catch(() => {});
  }, [user, youtubeId, onChange]);

  useEffect(() => {
    if (!pendingDraft) return;
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setDraft(pendingDraft.text);
      setDraftSource(pendingDraft.source);
      setDraftSourceId(pendingDraft.sourceId ?? null);
      setDraftMetadata(pendingDraft.metadata ?? null);
      onDraftConsumed?.();
    });

    return () => {
      cancelled = true;
    };
  }, [onDraftConsumed, pendingDraft]);

  const add = async () => {
    if (!user) {
      onRequestSignIn?.();
      toast.message('Sign in to save notes.');
      return;
    }
    if (!videoDbId) {
      toast.error('Video not yet saved. Try again in a moment.');
      return;
    }
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const note = await saveNote({
        youtubeId,
        videoId: videoDbId,
        source: draftSource,
        sourceId: draftSourceId ?? undefined,
        text: draft.trim(),
        metadata: draftMetadata ?? undefined,
      });
      onChange([note, ...notes]);
      setDraft('');
      setDraftSource('custom');
      setDraftSourceId(null);
      setDraftMetadata(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteNote(id);
      onChange(notes.filter((n) => n.id !== id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-4">
      <div className="space-y-2 rounded-2xl border border-border bg-surface-3 p-3">
        <textarea
          className="min-h-[72px] w-full resize-none rounded-xl border border-border bg-surface-2 p-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-transparent focus:ring-2 focus:ring-ring disabled:opacity-50"
          placeholder={user ? 'Write a note…' : 'Sign in to write notes.'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!user || busy}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Tip: highlight transcript text to save it as a note.
          </p>
          <Button size="sm" variant="accent" onClick={add} disabled={!draft.trim() || busy}>
            <Plus className="h-3 w-3" /> Save note
          </Button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {notes.map((n) => {
          const ts = n.metadata?.transcript?.start;
          const stripColor = SOURCE_COLOR[n.source] ?? 'hsl(var(--border))';
          return (
            <li
              key={n.id}
              className="group/note relative overflow-hidden rounded-xl border border-border bg-surface-2 pl-3"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: stripColor }}
              />
              <div className="flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-foreground">{n.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wider',
                      )}
                      style={{ borderColor: `${stripColor}40`, color: stripColor }}
                    >
                      {n.source}
                    </span>
                    {typeof ts === 'number' && (
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface-3 px-2 py-0.5 font-mono text-[11px] hover:text-foreground"
                        onClick={() => onSeek(ts)}
                      >
                        {formatDuration(ts)}
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => remove(n.id)}
                  title="Delete note"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-surface-3 hover:text-destructive group-hover/note:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
        {!notes.length && (
          <li className="rounded-2xl border border-dashed border-border bg-surface-3 p-6 text-center">
            <NotebookPen className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-foreground">No notes yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Save takeaways, highlight transcript lines, or write your own thoughts.
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

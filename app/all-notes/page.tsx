'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, NotebookPen, Search, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAllNotes, deleteNote } from '@/lib/notes-client';
import type { NoteSource, NoteWithVideo } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { buildVideoSlug, formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const SOURCE_COLOR: Record<string, string> = {
  transcript: 'hsl(var(--accent-lime))',
  takeaways: 'hsl(var(--accent-orange))',
  chat: '#7DD3FC',
  custom: '#F472B6',
};

const SOURCE_OPTIONS: Array<{ value: NoteSource | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'chat', label: 'Chat' },
  { value: 'takeaways', label: 'Takeaways' },
  { value: 'custom', label: 'Custom' },
];

type SortOption = 'recent' | 'oldest' | 'video';

function videoHref(video: NoteWithVideo['video']) {
  if (!video) return '/';
  const slug = video.slug || buildVideoSlug(video.title, video.youtubeId);
  return slug ? `/v/${slug}` : `/analyze/${video.youtubeId}`;
}

function sourceLabel(source: NoteSource) {
  if (source === 'takeaways') return 'Takeaways';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export default function AllNotesPage() {
  const { user, loading } = useAuth();
  const [notes, setNotes] = useState<NoteWithVideo[]>([]);
  const [query, setQuery] = useState('');
  const [filterSource, setFilterSource] = useState<NoteSource | ''>('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchAllNotes()
      .then((fetchedNotes) => {
        if (!cancelled) setNotes(fetchedNotes);
      })
      .catch((err) => {
        if (!cancelled) toast.error((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingNotes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = notes.filter((note) => {
      if (filterSource && note.source !== filterSource) return false;
      if (!q) return true;
      return `${note.text} ${note.video?.title ?? ''} ${note.video?.author ?? ''}`
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === 'video') return (a.video?.title ?? '').localeCompare(b.video?.title ?? '');
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sorted.reduce<Record<string, { video: NoteWithVideo['video']; notes: NoteWithVideo[] }>>(
      (acc, note) => {
        const key = note.video?.youtubeId ?? note.videoId;
        if (!acc[key]) acc[key] = { video: note.video, notes: [] };
        acc[key].notes.push(note);
        return acc;
      },
      {},
    );
  }, [filterSource, notes, query, sortBy]);

  const filteredCount = Object.values(grouped).reduce((sum, group) => sum + group.notes.length, 0);

  const handleDelete = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((note) => note.id !== id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCopy = async (note: NoteWithVideo) => {
    try {
      await navigator.clipboard.writeText(note.text);
      setCopiedId(note.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error('Could not copy note');
    }
  };

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="font-display text-3xl text-foreground">Sign in to see your notes.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-12 sm:px-8 sm:py-16">
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <NotebookPen className="h-3 w-3" /> Notes
        </span>
        <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          What you wanted to <em className="font-display italic text-lime">remember</em>.
        </h1>
        <p className="text-sm text-muted-foreground">
          {notes.length === 0
            ? 'No notes yet.'
            : `${notes.length} note${notes.length === 1 ? '' : 's'} saved from your videos.`}
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search notes, videos, or authors..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest first</option>
            <option value="video">By video</option>
          </select>
          <div className="flex flex-wrap gap-1.5">
            {SOURCE_OPTIONS.map((opt) => {
              const active = filterSource === opt.value;
              return (
                <button
                  key={opt.value || 'all'}
                  onClick={() => setFilterSource(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-transparent bg-foreground text-background'
                      : 'border-border bg-surface-2 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loadingNotes ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface-2 p-12 text-center text-sm text-muted-foreground">
          Loading notes...
        </div>
      ) : notes.length === 0 ? (
        <EmptyNotes />
      ) : filteredCount === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface-2 p-12 text-center text-sm text-muted-foreground">
          No notes match your filter.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([videoId, group]) => (
            <section key={videoId} className="overflow-hidden rounded-2xl border border-border bg-surface-2">
              <Link href={videoHref(group.video)} className="group flex gap-4 p-4 transition hover:bg-surface-3">
                {group.video?.thumbnailUrl ? (
                  <div className="relative h-[72px] w-28 shrink-0 overflow-hidden rounded-xl bg-black">
                    <Image src={group.video.thumbnailUrl} alt="" fill className="object-cover" sizes="112px" />
                  </div>
                ) : (
                  <div className="flex h-[72px] w-28 shrink-0 items-center justify-center rounded-xl bg-surface-3">
                    <Video className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="line-clamp-1 text-base font-semibold text-foreground group-hover:text-lime">
                    {group.video?.title ?? 'Unknown video'}
                  </h2>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {group.video?.author ?? 'Unknown author'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    {group.video?.duration ? <span>{formatDuration(group.video.duration)}</span> : null}
                    <span>{group.notes.length} note{group.notes.length === 1 ? '' : 's'}</span>
                  </div>
                </div>
              </Link>
              <ul className="divide-y divide-border/60">
                {group.notes.map((note) => {
                  const accent = SOURCE_COLOR[note.source] ?? 'hsl(var(--muted-foreground))';
                  return (
                    <li key={note.id} className="group/note relative pl-4">
                      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
                      <div className="flex items-start gap-3 p-4">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                              style={{ color: accent, background: `${accent}15` }}
                            >
                              {sourceLabel(note.source)}
                            </span>
                            {note.metadata?.timestampLabel ? (
                              <span className="rounded-full border border-border bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {note.metadata.timestampLabel}
                              </span>
                            ) : null}
                          </div>
                          <div className="prose prose-invert max-w-none text-sm text-foreground prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.text}</ReactMarkdown>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover/note:opacity-100">
                          <Button
                            type="button"
                            size="iconSm"
                            variant="ghost"
                            onClick={() => void handleCopy(note)}
                            title="Copy note"
                          >
                            {copiedId === note.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            type="button"
                            size="iconSm"
                            variant="ghost"
                            onClick={() => void handleDelete(note.id)}
                            title="Delete note"
                            className="hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyNotes() {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface-2 p-12 text-center">
      <NotebookPen className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
      <p className="font-display text-2xl text-foreground">No notes yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Highlight transcript text, save takeaways, or capture ideas while analyzing videos.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
      >
        Analyze a video
      </Link>
    </div>
  );
}

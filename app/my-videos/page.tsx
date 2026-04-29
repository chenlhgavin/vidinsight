'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Calendar, Heart, Library, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { csrfFetch } from '@/lib/csrf-client';
import { buildVideoSlug, formatDuration } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface VideoSummary {
  youtube_id: string;
  title: string;
  author: string;
  thumbnail_url: string | null;
  duration: number | null;
  slug: string | null;
}

interface Row {
  id: string;
  is_favorite: boolean;
  accessed_at: string;
  video_analyses: VideoSummary | null;
}

function videoHref(video: VideoSummary) {
  const slug = video.slug || buildVideoSlug(video.title, video.youtube_id);
  return slug ? `/v/${slug}` : `/analyze/${video.youtube_id}?cached=true`;
}

function relativeDate(input: string) {
  const time = new Date(input).getTime();
  if (!Number.isFinite(time)) return '';
  const diffMs = Date.now() - time;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(input).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MyVideosPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    void supabase
      .from('user_videos')
      .select(
        'id, is_favorite, accessed_at, video_analyses ( youtube_id, title, author, thumbnail_url, duration, slug )',
      )
      .order('accessed_at', { ascending: false })
      .then(({ data }) => setRows((data as Row[] | null) ?? []));
  }, [user]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const video = row.video_analyses;
      if (!video) return false;
      return `${video.title} ${video.author}`.toLowerCase().includes(q);
    });
  }, [query, rows]);

  const favorites = filteredRows.filter((r) => r.is_favorite);
  const favoriteTotal = rows.filter((r) => r.is_favorite).length;

  const toggleFavorite = async (row: Row) => {
    const video = row.video_analyses;
    if (!video) return;
    const next = !row.is_favorite;
    setUpdating(row.id);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_favorite: next } : r)));
    try {
      const r = await csrfFetch('/api/toggle-favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.youtube_id, isFavorite: next }),
      });
      const data = (await r.json().catch(() => null)) as { isFavorite?: boolean; error?: string } | null;
      if (!r.ok) throw new Error(data?.error || 'favorite_failed');
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, is_favorite: Boolean(data?.isFavorite) } : item,
        ),
      );
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_favorite: row.is_favorite } : r)));
      toast.error((err as Error).message);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="font-display text-3xl text-foreground">Sign in to see your library.</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Save analyses, sync notes, and pick up where you left off.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-12 sm:px-8 sm:py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Library className="h-3 w-3" /> Library
          </span>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Everything worth a <em className="font-display italic text-lime">rewatch</em>.
          </h1>
        </div>
        <p className="text-sm text-muted-foreground sm:max-w-xs">
          {rows.length === 0
            ? 'Your saved analyses will appear here.'
            : `${rows.length} video${rows.length === 1 ? '' : 's'} · ${favoriteTotal} favorite${favoriteTotal === 1 ? '' : 's'}`}
        </p>
      </header>

      <label className="relative block max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your videos..."
          className="h-10 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
        />
      </label>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="favorites">
            Favorites
            <span className="ml-1 rounded-full bg-surface-3 px-1.5 py-px font-mono text-[10px] data-[state=active]:bg-background/15">
              {favoriteTotal}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <VideoGrid rows={filteredRows} updating={updating} onToggleFavorite={toggleFavorite} />
        </TabsContent>
        <TabsContent value="favorites">
          <VideoGrid rows={favorites} updating={updating} onToggleFavorite={toggleFavorite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VideoGrid({
  rows,
  updating,
  onToggleFavorite,
}: {
  rows: Row[];
  updating: string | null;
  onToggleFavorite: (row: Row) => void;
}) {
  if (!rows.length) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-border bg-surface-2 p-12 text-center">
        <p className="font-display text-2xl text-foreground">Nothing here yet.</p>
        <p className="mt-2 text-sm text-muted-foreground">Paste a YouTube URL to start your library.</p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          Analyze a video <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => {
        const video = row.video_analyses;
        if (!video) return null;
        return (
          <Link
            key={row.id}
            href={videoHref(video)}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface-2 transition-all hover:-translate-y-0.5 hover:border-surface-4"
          >
            <div className="relative aspect-video w-full overflow-hidden bg-black">
              {video.thumbnail_url && (
                <Image
                  src={video.thumbnail_url}
                  alt=""
                  fill
                  sizes="(min-width:1280px) 25vw, (min-width:768px) 33vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
              {video.duration ? (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
                  {formatDuration(video.duration)}
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleFavorite(row);
                }}
                disabled={updating === row.id}
                className="absolute right-2 top-2 bg-black/60 text-white hover:bg-black/75 hover:text-white"
                aria-label={row.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {updating === row.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Heart className={`h-3.5 w-3.5 ${row.is_favorite ? 'fill-orange text-orange' : ''}`} />
                )}
              </Button>
            </div>
            <div className="space-y-2 p-4">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{video.title}</p>
              <p className="text-xs text-muted-foreground">{video.author}</p>
              <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {relativeDate(row.accessed_at)}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { ExternalLink, Heart, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoInfo } from '@/lib/types';
import { formatDuration } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  videoInfo: VideoInfo | null;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export function VideoHeader({ videoInfo, isFavorite, onToggleFavorite }: Props) {
  if (!videoInfo) return <div className="h-10" />;

  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <header className="mb-5 flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-3xl leading-[1.1] tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {videoInfo.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {videoInfo.author && <span className="font-medium text-foreground/80">{videoInfo.author}</span>}
          {videoInfo.duration ? (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="font-mono text-xs">{formatDuration(videoInfo.duration)}</span>
            </>
          ) : null}
          <span className="text-muted-foreground/40">·</span>
          <Link
            href={`https://youtube.com/watch?v=${videoInfo.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Open original
          </Link>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onToggleFavorite && (
          <Button size="sm" variant={isFavorite ? 'accent' : 'outline'} onClick={onToggleFavorite}>
            <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />
            {isFavorite ? 'Saved' : 'Save'}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onShare}>
          <Share2 className="h-3.5 w-3.5" /> Share
        </Button>
      </div>
    </header>
  );
}

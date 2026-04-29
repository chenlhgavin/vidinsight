'use client';

import { useState } from 'react';
import { Clock, User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { QuickPreview, VideoInfo } from '@/lib/types';
import { formatDuration } from '@/lib/utils';

interface LoadingContextProps {
  videoId?: string;
  videoInfo?: VideoInfo | null;
  preview?: QuickPreview | null;
}

export function LoadingContext({ videoId, videoInfo, preview }: LoadingContextProps) {
  const [thumbErrored, setThumbErrored] = useState(false);
  const thumbnailSrc = thumbErrored
    ? null
    : videoInfo?.thumbnail ||
      (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className="overflow-hidden p-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-surface-3 sm:w-48">
            {thumbnailSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailSrc}
                alt={videoInfo?.title ?? ''}
                className="h-full w-full object-cover"
                onError={() => setThumbErrored(true)}
              />
            ) : (
              <div className="h-full w-full animate-pulse bg-surface-4" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {videoInfo ? (
              <>
                <h2 className="line-clamp-2 font-display text-xl leading-tight text-foreground">
                  {videoInfo.title}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {videoInfo.author ? (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {videoInfo.author}
                    </span>
                  ) : null}
                  {videoInfo.duration ? (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDuration(videoInfo.duration)}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="h-6 w-3/4 animate-pulse rounded bg-surface-4" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-surface-4" />
              </div>
            )}

            {preview ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime">
                  {preview.title}
                </p>
                <p className="text-sm leading-6 text-foreground/80">{preview.summary}</p>
                {preview.glance.length > 0 && (
                  <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                    {preview.glance.map((item, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lime" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="h-3 w-full animate-pulse rounded bg-surface-4" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-surface-4" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-surface-4" />
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPlaybackQueue,
  focusForQueueItem,
  type PlaybackFocus,
  type PlaybackQueueItem,
} from '@/lib/playback-queue';
import type { PlaybackCommand } from '@/lib/types';

type YTPlayer = {
  destroy?: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
};

type YTPlayerCtor = new (
  el: HTMLElement,
  config: {
    videoId: string;
    playerVars?: Record<string, unknown>;
    events?: { onReady?: () => void };
  },
) => YTPlayer;

declare global {
  interface Window {
    YT?: { Player: YTPlayerCtor };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_ID = 'youtube-iframe-api';

function loadIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  return new Promise((resolve) => {
    if (!document.getElementById(SCRIPT_ID)) {
      const tag = document.createElement('script');
      tag.id = SCRIPT_ID;
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (window.YT?.Player) resolve();
  });
}

interface Props {
  videoId: string;
  command?: PlaybackCommand | null;
  onTime?: (seconds: number) => void;
  onSegmentEnd?: () => void;
  onPlaybackFocusChange?: (focus: PlaybackFocus) => void;
  onCommandExecuted?: () => void;
}

export function YouTubePlayer({
  videoId,
  command,
  onTime,
  onSegmentEnd,
  onPlaybackFocusChange,
  onCommandExecuted,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const queueRef = useRef<PlaybackQueueItem[]>([]);
  const queueIndexRef = useRef(0);
  const activeQueueRef = useRef(false);
  const segmentEndRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  const clearQueue = useCallback(
    (clearFocus: boolean) => {
      queueRef.current = [];
      queueIndexRef.current = 0;
      activeQueueRef.current = false;
      segmentEndRef.current = null;
      if (clearFocus) onPlaybackFocusChange?.({ kind: 'none' });
    },
    [onPlaybackFocusChange],
  );

  const playQueueItem = useCallback(
    (item: PlaybackQueueItem, index: number, autoPlay: boolean) => {
      const player = playerRef.current;
      if (!player) return;

      queueIndexRef.current = index;
      segmentEndRef.current = item.end;
      player.seekTo(item.start, true);
      if (autoPlay) player.playVideo();
      onPlaybackFocusChange?.(focusForQueueItem(item));
    },
    [onPlaybackFocusChange],
  );

  useEffect(() => {
    let destroyed = false;
    void (async () => {
      await Promise.resolve();
      if (destroyed) return;
      setReady(false);
      clearQueue(true);
      await loadIframeApi();
      if (destroyed || !containerRef.current) return;
      playerRef.current = new window.YT!.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: { onReady: () => setReady(true) },
      });
    })();
    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // ignore
      }
    };
  }, [videoId, clearQueue]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      try {
        const t = playerRef.current?.getCurrentTime?.();
        if (typeof t === 'number') {
          onTime?.(t);
          if (segmentEndRef.current !== null && t >= segmentEndRef.current - 0.1) {
            const queue = queueRef.current;
            const nextIndex = queueIndexRef.current + 1;
            if (activeQueueRef.current && nextIndex < queue.length) {
              playQueueItem(queue[nextIndex], nextIndex, true);
            } else {
              playerRef.current?.pauseVideo();
              queueRef.current = [];
              queueIndexRef.current = 0;
              activeQueueRef.current = false;
              segmentEndRef.current = null;
              onSegmentEnd?.();
            }
          }
        }
      } catch {
        // ignore
      }
    }, 250);
    return () => clearInterval(interval);
  }, [ready, onTime, onSegmentEnd, playQueueItem]);

  useEffect(() => {
    if (!ready || !command) return;
    const player = playerRef.current;
    if (!player) return;
    try {
      switch (command.type) {
        case 'SEEK':
          clearQueue(true);
          if (typeof command.time === 'number') {
            player.seekTo(command.time, true);
            if (command.autoPlay) player.playVideo();
          }
          break;
        case 'PLAY':
          clearQueue(false);
          player.playVideo();
          break;
        case 'PAUSE':
          clearQueue(true);
          player.pauseVideo();
          break;
        case 'PLAY_SEGMENT':
        case 'PLAY_TOPIC':
        case 'PLAY_CITATIONS':
        case 'PLAY_ALL': {
          const queue = buildPlaybackQueue(command);
          if (!queue.length) {
            clearQueue(true);
            break;
          }
          queueRef.current = queue;
          queueIndexRef.current = 0;
          activeQueueRef.current = true;
          playQueueItem(queue[0], 0, command.autoPlay !== false);
          break;
        }
      }
    } catch {
      // ignore
    } finally {
      onCommandExecuted?.();
    }
  }, [clearQueue, command, onCommandExecuted, playQueueItem, ready]);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] bg-lime/3 blur-3xl"
      />
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black surface-inner">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}

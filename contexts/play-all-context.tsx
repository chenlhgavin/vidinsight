'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Topic } from '@/lib/types';

interface PlayAllState {
  active: boolean;
  queue: Topic[];
  index: number;
}

interface PlayAllContextValue extends PlayAllState {
  start: (queue: Topic[]) => void;
  next: () => Topic | null;
  stop: () => void;
}

const PlayAllContext = createContext<PlayAllContextValue>({
  active: false,
  queue: [],
  index: 0,
  start: () => {},
  next: () => null,
  stop: () => {},
});

export function PlayAllProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlayAllState>({ active: false, queue: [], index: 0 });

  const start = useCallback((queue: Topic[]) => {
    setState({ active: true, queue, index: 0 });
  }, []);

  const next = useCallback(() => {
    let nextTopic: Topic | null = null;
    setState((s) => {
      if (!s.active) return s;
      const nextIndex = s.index + 1;
      if (nextIndex >= s.queue.length) return { active: false, queue: [], index: 0 };
      nextTopic = s.queue[nextIndex];
      return { ...s, index: nextIndex };
    });
    return nextTopic;
  }, []);

  const stop = useCallback(() => {
    setState({ active: false, queue: [], index: 0 });
  }, []);

  const value = useMemo(() => ({ ...state, start, next, stop }), [state, start, next, stop]);
  return <PlayAllContext.Provider value={value}>{children}</PlayAllContext.Provider>;
}

export function usePlayAll() {
  return useContext(PlayAllContext);
}

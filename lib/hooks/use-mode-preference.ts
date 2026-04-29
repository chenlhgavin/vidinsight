'use client';

import { useCallback } from 'react';
import type { TopicGenerationMode } from '@/lib/types';

export function useModePreference() {
  const setMode = useCallback(
    async (next: TopicGenerationMode) => {
      void next;
    },
    [],
  );

  return { mode: 'smart' as TopicGenerationMode, setMode, isLoading: false };
}

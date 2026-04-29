'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'vidinsight:translation-target';

function getInitialTarget(): string {
  if (typeof window === 'undefined') return 'en';
  return localStorage.getItem(STORAGE_KEY) ?? 'en';
}

export function useTranslationPreference() {
  const { user, loading: authLoading } = useAuth();
  const [target, setTargetState] = useState<string>(getInitialTarget);
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    void supabase
      .from('profiles')
      .select('preferred_target_language')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const lang = (data?.preferred_target_language as string | null) ?? null;
        if (lang) setTargetState(lang);
        setHasLoadedProfile(true);
      });
  }, [user]);

  const setTarget = useCallback(
    async (next: string) => {
      setTargetState(next);
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
      if (user) {
        const supabase = createClient();
        await supabase.from('profiles').update({ preferred_target_language: next }).eq('id', user.id);
      }
    },
    [user],
  );

  const isLoading = authLoading || (user !== null && !hasLoadedProfile);

  return { target, setTarget, isLoading };
}

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { csrfFetch } from '@/lib/csrf-client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
});

const PENDING_VIDEO_KEY = 'vidinsight:pendingVideoId';
const HIDDEN_REFRESH_THRESHOLD_MS = 30_000;

async function linkPendingVideoWithRetry(videoId: string) {
  const delays = [200, 500, 1500];
  for (let i = 0; i < delays.length; i++) {
    try {
      const r = await csrfFetch('/api/link-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });
      if (r.ok) return true;
      if (r.status === 401) return false;
    } catch {
      // retry
    }
    if (i < delays.length - 1) await new Promise((res) => setTimeout(res, delays[i]));
  }
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

  if (supabaseRef.current == null) {
    if (typeof window !== 'undefined') {
      try {
        supabaseRef.current = createClient();
      } catch {
        // SSR or missing env — leave null; loading will resolve to false below
      }
    }
  }

  const refresh = useCallback(async () => {
    const sb = supabaseRef.current;
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data } = await sb.auth.getUser();
    const nextUser = data.user ?? null;
    setUser(nextUser);
    setLoading(false);
    if (nextUser && typeof window !== 'undefined') {
      const pending = sessionStorage.getItem(PENDING_VIDEO_KEY);
      if (pending) {
        const ok = await linkPendingVideoWithRetry(pending);
        if (ok) sessionStorage.removeItem(PENDING_VIDEO_KEY);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    const sb = supabaseRef.current;
    if (!sb) return;
    await sb.auth.signOut();
    setUser(null);
  }, []);

  useEffect(() => {
    const sb = supabaseRef.current;
    if (!sb) {
      setLoading(false);
      return;
    }
    void refresh();

    const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);

      if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
        const pending = sessionStorage.getItem(PENDING_VIDEO_KEY);
        if (pending) {
          const ok = await linkPendingVideoWithRetry(pending);
          if (ok) sessionStorage.removeItem(PENDING_VIDEO_KEY);
        }
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAtRef.current) {
        const dt = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (dt > HIDDEN_REFRESH_THRESHOLD_MS) void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function rememberPendingVideo(videoId: string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(PENDING_VIDEO_KEY, videoId);
  }
}

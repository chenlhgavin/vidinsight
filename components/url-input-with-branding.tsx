'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UrlInput } from '@/components/url-input';
import { useAuth } from '@/contexts/auth-context';
import { AuthModal } from '@/components/auth-modal';
import { toast } from 'sonner';

interface Props {
  variant?: 'hero' | 'compact';
}

export function UrlInputWithBranding({ variant = 'hero' }: Props) {
  if (variant === 'compact') {
    return (
      <div className="flex flex-col items-center gap-4">
        <UrlInput variant="hero" size="lg" />
      </div>
    );
  }

  return <HeroBrandedInput />;
}

function HeroBrandedInput() {
  const params = useSearchParams();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const auth = params.get('auth');
  const [processedAuth, setProcessedAuth] = useState<string | null>(null);

  if (auth !== processedAuth) {
    setProcessedAuth(auth);
    if (auth === 'open' && !user) {
      setAuthOpen(true);
    }
  }

  useEffect(() => {
    if (auth === 'limit') {
      toast.message('Sign in to analyze more videos.');
    }
  }, [auth]);

  return (
    <div className="flex flex-col items-center gap-4">
      <UrlInput variant="hero" size="lg" autoFocus />
      <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-lime" />
        Free preview without signing in.
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </button>
        to save videos and notes.
      </p>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}

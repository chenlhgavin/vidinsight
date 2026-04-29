'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AuthModal } from '@/components/auth-modal';

export function AuthLimitTrigger() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('auth') !== 'limit') return;
    let message: string | null = null;
    let pending: string | null = null;
    try {
      message = sessionStorage.getItem('vidinsight:limitRedirectMessage');
      sessionStorage.removeItem('vidinsight:limitRedirectMessage');
      pending = sessionStorage.getItem('vidinsight:pendingVideoId');
    } catch {
      // ignore
    }
    if (message) toast.error(message);
    /* eslint-disable react-hooks/set-state-in-effect */
    setPendingVideoId(pending);
    setOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    router.replace(pathname || '/', { scroll: false });
  }, [params, router, pathname]);

  return (
    <AuthModal
      open={open}
      onOpenChange={setOpen}
      trigger="generation-limit"
      currentVideoId={pendingVideoId}
    />
  );
}

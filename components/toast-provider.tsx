'use client';

import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      theme="dark"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group rounded-2xl border border-border bg-surface-3 text-foreground shadow-2xl shadow-black/40',
          title: 'text-sm font-semibold',
          description: 'text-xs text-muted-foreground',
          success:
            'border-lime/30 bg-surface-3',
          error:
            'border-destructive/40 bg-surface-3 text-foreground',
          actionButton:
            '!bg-lime !text-primary-foreground',
        },
      }}
    />
  );
}

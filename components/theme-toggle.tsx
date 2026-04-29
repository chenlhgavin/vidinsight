'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'vidinsight:theme';
const CHANGE_EVENT = 'vidinsight:theme-change';

function applyMode(mode: Mode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const prefersLight =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
      : mode === 'light';
  root.classList.toggle('light', prefersLight);
  root.classList.toggle('dark', !prefersLight);
}

function persistMode(next: Mode) {
  localStorage.setItem(STORAGE_KEY, next);
  applyMode(next);
  window.dispatchEvent(new CustomEvent<Mode>(CHANGE_EVENT, { detail: next }));
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener('change', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
    mq.removeEventListener('change', cb);
  };
}

function useMode(): Mode {
  return useSyncExternalStore(
    subscribe,
    () => (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? 'dark',
    () => 'dark',
  );
}

function useIsLight(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains('light'),
    () => false,
  );
}

export function ThemeToggle() {
  const mode = useMode();

  const opts: { id: Mode; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1">
      {opts.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => persistMode(o.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <o.icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ThemeToggleButton({ className }: { className?: string }) {
  const isLight = useIsLight();

  return (
    <button
      type="button"
      onClick={() => persistMode(isLight ? 'dark' : 'light')}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition hover:bg-surface-3',
        className,
      )}
      suppressHydrationWarning
    >
      <span suppressHydrationWarning>
        {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </span>
    </button>
  );
}

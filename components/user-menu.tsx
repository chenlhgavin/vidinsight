'use client';

import Link from 'next/link';
import { LogOut, User as UserIcon, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/?auth=open"
        className="hidden items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_8px_30px_hsl(var(--accent-lime)/0.18)] transition hover:brightness-110 active:scale-[0.98] sm:inline-flex"
      >
        Sign in
      </Link>
    );
  }

  const name = user.email?.split('@')[0] ?? 'You';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1.5 pl-1.5 pr-3 text-sm text-foreground transition hover:bg-surface-3"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-4">
          <UserIcon className="h-3.5 w-3.5 text-foreground/70" />
        </span>
        <span className="hidden max-w-[8rem] truncate sm:inline">{name}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] w-56 origin-top-right rounded-2xl border border-border bg-surface-2 p-1.5 shadow-2xl shadow-black/40 surface-inner"
        >
          <div className="px-2.5 py-2">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          <MenuLink href="/my-videos" label="Library" onClose={() => setOpen(false)} />
          <MenuLink href="/all-notes" label="All notes" onClose={() => setOpen(false)} />
          <MenuLink href="/settings" label="Settings" onClose={() => setOpen(false)} />
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-foreground/80 transition hover:bg-surface-3 hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="block rounded-xl px-2.5 py-2 text-sm text-foreground/80 transition hover:bg-surface-3 hover:text-foreground"
    >
      {label}
    </Link>
  );
}

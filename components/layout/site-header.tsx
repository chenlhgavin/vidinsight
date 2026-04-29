'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { UserMenu } from '@/components/user-menu';
import { ThemeToggleButton } from '@/components/theme-toggle';
import { Logo } from '@/components/layout/logo';
import { MobileNav } from '@/components/layout/mobile-nav';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';

const NAV_LINKS = [
  { href: '/my-videos', label: 'Library', authOnly: true },
  { href: '/all-notes', label: 'Notes', authOnly: true },
  { href: '/#how-it-works', label: 'How it works', authOnly: false },
  { href: '/#features', label: 'Features', authOnly: false },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = NAV_LINKS.filter((l) => !l.authOnly || user);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full transition-all duration-300',
        scrolled
          ? 'border-b border-border bg-background/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="VidInsight home" className="group inline-flex items-center gap-2.5">
            <Logo />
            <span className="hidden font-display text-lg leading-none tracking-tight text-foreground sm:inline">
              VidInsight
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const active = pathname === l.href || (l.href !== '/' && pathname?.startsWith(l.href.split('#')[0]) && !l.href.includes('#'));
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-surface-3 text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggleButton />
          <UserMenu />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-3 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </div>
      <MobileNav open={open} onOpenChange={setOpen} links={links} />
    </header>
  );
}

import Link from 'next/link';
import { Logo } from '@/components/layout/logo';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Logo size="sm" />
            <span className="font-display text-xl leading-none tracking-tight text-foreground">
              VidInsight
            </span>
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">
            Turn long YouTube videos into a focused study workbench. Highlights, cited chat, notes — in context.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { href: '/#features', label: 'Features' },
            { href: '/#how-it-works', label: 'How it works' },
            { href: '/my-videos', label: 'Library' },
            { href: '/all-notes', label: 'Notes' },
          ]}
        />
        <FooterCol
          title="Account"
          links={[
            { href: '/settings', label: 'Settings' },
            { href: '/?auth=open', label: 'Sign in' },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { href: '/privacy', label: 'Privacy' },
            { href: '/terms', label: 'Terms' },
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-8">
          <p>© {new Date().getFullYear()} VidInsight. Watch less. Learn more.</p>
          <p className="font-mono">v0.1</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
        {title}
      </p>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-foreground/80 transition hover:text-foreground">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

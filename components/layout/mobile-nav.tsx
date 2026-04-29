'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Logo } from '@/components/layout/logo';

interface Link {
  href: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  links: Link[];
}

export function MobileNav({ open, onOpenChange, links }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <Logo size="sm" />
            <DialogTitle className="text-2xl">VidInsight</DialogTitle>
          </div>
          <DialogDescription>Watch less. Learn more.</DialogDescription>
        </DialogHeader>
        <nav className="-mx-2 flex flex-col">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => onOpenChange(false)}
              className="rounded-xl px-3 py-3 text-base font-medium text-foreground transition hover:bg-surface-3"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}

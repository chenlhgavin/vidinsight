'use client';

import { Suspense } from 'react';
import { ArrowRight } from 'lucide-react';
import { RevealSection } from '@/components/ui/section';
import { UrlInputWithBranding } from '@/components/url-input-with-branding';

export function ClosingCTA() {
  return (
    <RevealSection className="mx-auto w-full max-w-7xl px-5 pt-32 sm:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-2 px-6 py-14 sm:py-20">
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-lime/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-orange/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-3 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <ArrowRight className="h-3 w-3" /> Try it now
          </span>
          <h2 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Stop scrubbing. Start <em className="font-display italic text-lime">studying</em>.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Paste any YouTube URL and get a focused workspace in seconds. Free preview, no signup.
          </p>
          <div className="mt-10">
            <Suspense fallback={null}>
              <UrlInputWithBranding variant="compact" />
            </Suspense>
          </div>
        </div>
      </div>
    </RevealSection>
  );
}

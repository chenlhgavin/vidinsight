import { Suspense } from 'react';
import { Sparkles } from 'lucide-react';
import { UrlInputWithBranding } from '@/components/url-input-with-branding';
import { HeroPreview } from '@/components/landing/hero-preview';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { HowItWorks } from '@/components/landing/how-it-works';
import { UseCases } from '@/components/landing/use-cases';
import { ClosingCTA } from '@/components/landing/closing-cta';
import { AuthLimitTrigger } from '@/components/auth-limit-trigger';

export default function Home() {
  return (
    <div className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-[-12rem] -z-10 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-lime/8 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-8rem] top-[8rem] -z-10 h-72 w-72 rounded-full bg-orange/6 blur-[100px]" />
      <div className="pointer-events-none absolute left-[-8rem] top-[20rem] -z-10 h-72 w-72 rounded-full bg-sky-500/5 blur-[100px]" />

      <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-5 pb-8 pt-16 text-center sm:px-8 sm:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-lime" />
          Watch less. Learn more.
        </div>

        <h1 className="mt-8 max-w-6xl text-balance font-display text-4xl leading-[1.02] tracking-[-0.02em] text-foreground sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
          Turn YouTube into a{' '}
          <em className="font-display italic text-lime">study</em>{' '}
          workbench.
        </h1>
        <p className="mt-8 max-w-2xl text-balance text-lg font-medium leading-relaxed text-muted-foreground sm:text-xl">
          Transcript, highlights, cited chat, and notes. One focused workspace for the videos worth watching twice.
        </p>

        <div className="mt-12 w-full">
          <Suspense fallback={null}>
            <UrlInputWithBranding />
            <AuthLimitTrigger />
          </Suspense>
        </div>

        <HeroPreview />
      </section>

      <UseCases />
      <FeatureGrid />
      <HowItWorks />
      <ClosingCTA />
    </div>
  );
}

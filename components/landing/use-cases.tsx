'use client';

import { GraduationCap, Mic, Briefcase, BookOpen } from 'lucide-react';
import { RevealSection, SectionEyebrow } from '@/components/ui/section';

const CASES = [
  { icon: GraduationCap, label: 'University lectures' },
  { icon: Mic, label: '4-hour podcasts' },
  { icon: Briefcase, label: 'Conference talks' },
  { icon: BookOpen, label: 'Tutorials & courses' },
];

export function UseCases() {
  return (
    <RevealSection className="mx-auto w-full max-w-7xl px-5 pt-32 sm:px-8">
      <div className="mb-10 flex flex-col items-start gap-4">
        <SectionEyebrow>Made for the long stuff</SectionEyebrow>
        <h2 className="max-w-3xl font-display text-3xl leading-[1.1] tracking-tight text-foreground sm:text-4xl md:text-5xl">
          Built for hours-long video, not 60-second clips.
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {CASES.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4 transition hover:border-surface-4 hover:bg-surface-3"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-3 text-foreground/80 transition group-hover:text-lime">
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-foreground">{label}</p>
          </div>
        ))}
      </div>
    </RevealSection>
  );
}

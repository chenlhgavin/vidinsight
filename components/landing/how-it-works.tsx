'use client';

import { motion } from 'framer-motion';
import { Link2, Wand2, GraduationCap } from 'lucide-react';
import { RevealSection, SectionEyebrow } from '@/components/ui/section';

const STEPS = [
  {
    n: '01',
    icon: Link2,
    title: 'Paste any YouTube URL',
    body: 'Lectures, podcasts, talks, tutorials — anything with a transcript. No download required.',
  },
  {
    n: '02',
    icon: Wand2,
    title: 'AI extracts the structure',
    body: 'In a few seconds: chapters, key takeaways, top quotes, suggested questions — all timecoded.',
  },
  {
    n: '03',
    icon: GraduationCap,
    title: 'Study, ask, and keep notes',
    body: 'Watch with the highlights bar, ask cited questions, save the moments you actually want to remember.',
  },
];

export function HowItWorks() {
  return (
    <RevealSection id="how-it-works" className="mx-auto w-full max-w-7xl px-5 pt-32 sm:px-8">
      <div className="mb-12 flex flex-col items-start gap-4">
        <SectionEyebrow>How it works</SectionEyebrow>
        <h2 className="max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
          Three steps. <em className="font-display italic text-muted-foreground">No magic.</em>
        </h2>
      </div>
      <div className="relative grid gap-4 md:grid-cols-3">
        <div
          aria-hidden
          className="absolute left-7 right-7 top-7 hidden h-px bg-[linear-gradient(90deg,transparent,hsl(var(--border))_20%,hsl(var(--border))_80%,transparent)] md:block"
        />
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-3xl border border-border bg-surface-2 p-7"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-3">
                <s.icon className="h-5 w-5 text-foreground/80" />
              </span>
              <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">
                {s.n}
              </span>
            </div>
            <h3 className="font-display text-2xl leading-tight text-foreground">{s.title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </RevealSection>
  );
}

'use client';

import { motion } from 'framer-motion';
import { Compass, MessagesSquare, NotebookPen } from 'lucide-react';
import { RevealSection, SectionEyebrow } from '@/components/ui/section';

const FEATURES = [
  {
    icon: Compass,
    title: 'Highlights with timecodes',
    body:
      'AI extracts the chapters worth watching, ranked by signal. Click to jump straight in, or play them as a tight reel.',
    accent: 'hsl(var(--accent-lime))',
  },
  {
    icon: MessagesSquare,
    title: 'Cited chat, not hallucinated',
    body:
      'Every answer footnotes back to the exact transcript moment. Click [3] and the player scrubs to it instantly.',
    accent: 'hsl(var(--accent-orange))',
  },
  {
    icon: NotebookPen,
    title: 'Notes that stay in context',
    body:
      'Highlight any line of transcript, save a takeaway, or jot your own thought — all linked to the timestamp.',
    accent: '#7DD3FC',
  },
];

export function FeatureGrid() {
  return (
    <RevealSection id="features" className="mx-auto w-full max-w-7xl px-5 pt-32 sm:px-8">
      <div className="mb-12 flex flex-col items-start gap-4">
        <SectionEyebrow>Features</SectionEyebrow>
        <h2 className="max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
          A workbench, not a <em className="font-display italic text-lime">summary tool</em>.
        </h2>
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          Most &ldquo;AI for video&rdquo; gives you a 200-word recap and walks away. VidInsight keeps the source on screen and gives you tools to actually study it.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="group relative overflow-hidden rounded-3xl border border-border bg-surface-2 p-7 transition-all hover:border-surface-4 hover:bg-surface-3"
          >
            <div
              className="absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-20 blur-3xl transition-opacity group-hover:opacity-40"
              style={{ background: f.accent }}
              aria-hidden
            />
            <div
              className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-3"
              style={{ color: f.accent }}
            >
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display text-2xl leading-tight text-foreground">{f.title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </RevealSection>
  );
}

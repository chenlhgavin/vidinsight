'use client';

import { motion } from 'framer-motion';
import { MessageSquare, Sparkles, Quote, Play } from 'lucide-react';

const HIGHLIGHTS = [
  { color: 'hsl(var(--accent-lime))', title: 'Why long-form learning beats clips', dur: '2:18' },
  { color: 'hsl(var(--accent-orange))', title: 'The compounding-attention loop', dur: '3:42' },
  { color: '#7DD3FC', title: 'How to take notes that compound', dur: '1:55' },
  { color: '#F472B6', title: 'A simple rubric for "watch or skip?"', dur: '2:09' },
];

const TRANSCRIPT = [
  { t: '03:12', text: 'The trick is to pause when an idea actually lands…' },
  { t: '03:24', text: '…and that almost never happens in a 30-second clip.' },
  { t: '03:31', text: 'You need long form to build the reps.' },
];

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

export function HeroPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="relative mx-auto mt-16 w-full max-w-6xl"
    >
      <div className="absolute inset-x-0 -top-12 mx-auto h-72 w-3/4 -z-10 rounded-full bg-lime/8 blur-3xl" />
      <div className="rounded-3xl border border-border bg-surface-2 p-3 shadow-2xl shadow-black/40 surface-inner sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
          {/* Left: video + highlights */}
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#7DD3FC22,transparent_55%),radial-gradient(circle_at_70%_70%,#FB718522,transparent_55%)]" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur ring-1 ring-white/10">
                  <Play className="h-6 w-6 fill-white text-white" />
                </div>
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                <div className="flex-1 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-1/3 rounded-full bg-lime" />
                </div>
                <span className="text-[10px] font-mono text-white/70">23:14 / 1:08:32</span>
              </div>
            </div>

            {/* progress bar with chips */}
            <div className="rounded-2xl border border-border bg-surface-3 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="font-semibold text-foreground/80">Highlights</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-lime px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  <Play className="h-2.5 w-2.5 fill-current" /> Play all
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-surface-4">
                {[12, 28, 44, 62, 78].map((left, i) => (
                  <span
                    key={i}
                    className="absolute top-0 h-full w-[8%] rounded-full"
                    style={{ left: `${left}%`, background: HIGHLIGHTS[i % HIGHLIGHTS.length].color, opacity: 0.85 }}
                  />
                ))}
                <span className="absolute top-0 h-full w-[2px] bg-lime shadow-[0_0_8px_hsl(var(--accent-lime))]" style={{ left: '34%' }} />
              </div>
            </div>

            <motion.ul
              variants={STAGGER}
              initial="hidden"
              animate="show"
              className="grid gap-2 sm:grid-cols-2"
            >
              {HIGHLIGHTS.map((h, i) => (
                <motion.li
                  key={i}
                  variants={ITEM}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface-3 p-3"
                >
                  <span
                    className="h-9 w-9 shrink-0 rounded-xl"
                    style={{
                      background: `linear-gradient(135deg, ${h.color}, ${h.color}55)`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1)`,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{h.title}</p>
                    <p className="text-xs text-muted-foreground">{h.dur}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </div>

          {/* Right: tab panel */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-3">
            <div className="flex items-center gap-1 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="rounded-full bg-foreground px-2.5 py-1 text-background">Summary</span>
              <span className="rounded-full px-2.5 py-1">Chat</span>
              <span className="rounded-full px-2.5 py-1">Transcript</span>
              <span className="rounded-full px-2.5 py-1">Notes</span>
            </div>
            <div className="space-y-4 p-4">
              <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-2.5">
                {[
                  { label: 'Core thesis', insight: 'Long videos compound attention; clips fragment it.' },
                  { label: 'The reps', insight: 'Pause + paraphrase every key claim, twice per chapter.' },
                ].map((t, i) => (
                  <motion.div
                    key={i}
                    variants={ITEM}
                    className="flex gap-3 rounded-xl border border-border bg-surface-2 p-3"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t.label}
                      </p>
                      <p className="text-sm text-foreground">{t.insight}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              <div className="space-y-2 border-t border-border pt-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Quote className="h-3 w-3" /> Top quote
                </p>
                <blockquote className="border-l-2 border-orange pl-3 font-display text-base italic leading-snug text-foreground">
                  &ldquo;You need long form to build the reps.&rdquo;
                </blockquote>
              </div>

              <div className="space-y-1.5 border-t border-border pt-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <MessageSquare className="h-3 w-3" /> Transcript
                </p>
                {TRANSCRIPT.map((s, i) => (
                  <div
                    key={i}
                    className={`flex gap-2.5 rounded-md px-2 py-1 text-xs leading-5 ${
                      i === 1 ? 'border-l-2 border-lime bg-lime/8' : ''
                    }`}
                  >
                    <span className="shrink-0 font-mono text-muted-foreground">{s.t}</span>
                    <span className={i === 1 ? 'text-foreground' : 'text-muted-foreground'}>{s.text}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-lime" />
                Suggested: How does the reps idea apply to lectures?
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

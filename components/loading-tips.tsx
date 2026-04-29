'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

const STAGES = [
  { id: 'fetching', label: 'Fetching transcript' },
  { id: 'understanding', label: 'Understanding the video' },
  { id: 'generating', label: 'Generating highlights & summary' },
  { id: 'processing', label: 'Saving analysis' },
] as const;

const TIPS = [
  'Hover any highlight chip to see what was said.',
  'Click [3] in chat answers to scrub the player to that exact moment.',
  'Highlight any transcript line to save it as a note.',
  'Use Play All to watch the whole gist as a tight reel.',
  'Top quotes are pulled by the model, not by frequency.',
];

interface Props {
  stage: string;
}

export function LoadingTips({ stage }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [prevStage, setPrevStage] = useState(stage);

  if (prevStage !== stage) {
    setPrevStage(stage);
    setElapsed(0);
  }

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    const id = setInterval(() => setTipIdx((v) => (v + 1) % TIPS.length), 4500);
    return () => clearInterval(id);
  }, []);

  const stageIdx = STAGES.findIndex((s) => s.id === stage);
  const progress = stageIdx >= 0 ? ((stageIdx + 0.5) / STAGES.length) * 100 : 5;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-20 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin text-lime" />
        Working ({elapsed}s)
      </span>
      <h2 className="mt-6 font-display text-3xl leading-tight text-foreground sm:text-4xl">
        Building your workbench…
      </h2>

      <ul className="mt-10 w-full max-w-md space-y-2.5 text-left">
        {STAGES.map((s, i) => {
          const status = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending';
          return (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  status === 'done'
                    ? 'bg-lime text-primary-foreground'
                    : status === 'active'
                    ? 'bg-lime/20 text-lime'
                    : 'bg-surface-4 text-muted-foreground'
                }`}
              >
                {status === 'done' ? (
                  <Check className="h-3 w-3" />
                ) : status === 'active' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="font-mono text-[10px]">{i + 1}</span>
                )}
              </span>
              <span
                className={`text-sm ${
                  status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 h-1 w-full max-w-md overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full bg-lime"
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      <div className="mt-10 h-12 w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.p
            key={tipIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="text-sm text-muted-foreground"
          >
            <span className="text-foreground/80">Tip · </span>
            {TIPS[tipIdx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

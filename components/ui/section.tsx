'use client';

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface RevealSectionProps extends HTMLMotionProps<'section'> {
  delay?: number;
  amount?: number;
}

export function RevealSection({ className, delay = 0, amount = 0.2, children, ...props }: RevealSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.section>
  );
}

export function SectionEyebrow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

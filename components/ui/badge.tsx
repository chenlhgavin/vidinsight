import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
  {
    variants: {
      variant: {
        default:
          'border-border bg-surface-3 text-foreground/80',
        outline:
          'border-border text-muted-foreground',
        lime:
          'border-lime/30 bg-lime/12 text-lime',
        orange:
          'border-orange/30 bg-orange/12 text-orange',
        ghost:
          'border-transparent bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

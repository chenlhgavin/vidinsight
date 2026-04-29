import * as React from 'react';
import { cn } from '@/lib/utils';

type Tier = 1 | 2 | 3 | 4;

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: Tier;
  interactive?: boolean;
}

const tierClass: Record<Tier, string> = {
  1: 'bg-surface-1',
  2: 'bg-surface-2',
  3: 'bg-surface-3',
  4: 'bg-surface-4',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, tier = 2, interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-border surface-inner',
        tierClass[tier],
        interactive && 'transition-all hover:border-surface-4 hover:bg-surface-3',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-start justify-between gap-3 p-5', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-base font-semibold tracking-tight text-foreground', className)} {...props} />
);

export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-5 pt-0', className)} {...props} />
);

export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between gap-3 p-5 pt-0', className)} {...props} />
);

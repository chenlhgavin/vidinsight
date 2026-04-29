import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: 'sm' | 'md';
}

export function Logo({ className, size = 'md' }: Props) {
  const dims = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center rounded-xl border border-border bg-surface-3 surface-inner',
        dims,
        className,
      )}
      aria-hidden
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M3 3.5C3 2.67 3.67 2 4.5 2H6L8 4H11.5C12.33 4 13 4.67 13 5.5V12.5C13 13.33 12.33 14 11.5 14H4.5C3.67 14 3 13.33 3 12.5V3.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M6.5 9.5L9.5 8L6.5 6.5V9.5Z" fill="currentColor" />
      </svg>
      <span className="absolute -right-0.5 -top-0.5 inline-block h-2 w-2 rounded-full bg-lime shadow-[0_0_8px_hsl(var(--accent-lime)/0.7)]" />
    </span>
  );
}

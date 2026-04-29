'use client';

import { cn } from '@/lib/utils';

interface Props {
  themes: string[];
  selected: string | null;
  onSelect: (theme: string | null) => void;
}

export function ThemeSelector({ themes, selected, onSelect }: Props) {
  if (!themes.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip active={selected === null} onClick={() => onSelect(null)}>All</Chip>
      {themes.map((t) => (
        <Chip key={t} active={selected === t} onClick={() => onSelect(t)}>
          <span className="capitalize">{t}</span>
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-semibold transition',
        active
          ? 'border-transparent bg-foreground text-background'
          : 'border-border bg-surface-2 text-muted-foreground hover:border-surface-4 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

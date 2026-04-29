'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, extractVideoId } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  defaultValue?: string;
  className?: string;
  size?: 'default' | 'lg';
  autoFocus?: boolean;
  variant?: 'default' | 'hero';
}

export function UrlInput({
  defaultValue,
  className,
  size = 'default',
  autoFocus,
  variant = 'default',
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue ?? '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const videoId = extractVideoId(value);
    if (!videoId) {
      toast.error('Please paste a valid YouTube URL.');
      return;
    }
    setSubmitting(true);
    router.push(`/analyze/${videoId}?url=${encodeURIComponent(value)}`);
  };

  if (variant === 'hero') {
    const hasInput = value.length > 0;
    return (
      <form
        onSubmit={handleSubmit}
        className={cn(
          'group/url relative mx-auto flex w-full max-w-2xl items-center gap-2 rounded-full border border-border bg-surface-2/85 p-1.5 shadow-[0_30px_80px_-20px_hsl(var(--accent-lime)/0.15)] backdrop-blur-xl transition-all focus-within:border-lime/40 focus-within:shadow-[0_30px_80px_-20px_hsl(var(--accent-lime)/0.35)]',
          className,
        )}
      >
        <label htmlFor="hero-youtube-url" className="sr-only">
          YouTube URL
        </label>
        <span className="ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted-foreground transition group-focus-within/url:text-lime">
          <Link2 className="h-4 w-4" />
        </span>
        <input
          id="hero-youtube-url"
          type="url"
          inputMode="url"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste any YouTube URL…"
          className="h-11 min-w-0 flex-1 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
          required
        />
        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={submitting || !hasInput}
          className="group/btn"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing
            </>
          ) : (
            <>
              Analyze
              <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn('flex w-full gap-2', className)}>
      <Input
        type="url"
        inputMode="url"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste a YouTube URL"
        className={size === 'lg' ? 'h-12 text-base' : ''}
        required
      />
      <Button type="submit" variant="accent" size={size === 'lg' ? 'lg' : 'default'} disabled={submitting}>
        {submitting ? 'Analyzing…' : 'Analyze'}
      </Button>
    </form>
  );
}

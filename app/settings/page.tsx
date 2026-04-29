'use client';

import { useAuth } from '@/contexts/auth-context';
import { useTranslationPreference } from '@/lib/hooks/use-translation-preference';
import { ThemeToggle } from '@/components/theme-toggle';
import { Globe, Mail, Palette } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
];

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { target, setTarget } = useTranslationPreference();

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="font-display text-3xl text-foreground">Sign in to access settings.</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Account preferences sync across all your devices.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-5 py-12 sm:px-8 sm:py-16">
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Settings
        </span>
        <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Make it yours.
        </h1>
      </header>

      <SettingsSection icon={Mail} title="Account" description="Where notifications and magic links are sent.">
        <div className="rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm text-foreground">
          {user.email}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Palette}
        title="Appearance"
        description="Pick a theme. Cinematic dark is the default."
      >
        <ThemeToggle />
      </SettingsSection>

      <SettingsSection
        icon={Globe}
        title="Translation target"
        description="Default language for transcript, chat, and topic translations."
      >
        <select
          value={target}
          onChange={(e) => void setTarget(e.target.value)}
          className="h-10 w-full max-w-xs rounded-xl border border-border bg-surface-3 px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 rounded-3xl border border-border bg-surface-2 p-6 sm:grid-cols-[1fr_1.4fr] sm:p-8">
      <div className="space-y-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-3 text-foreground/80">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-display text-2xl leading-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-start">{children}</div>
    </section>
  );
}

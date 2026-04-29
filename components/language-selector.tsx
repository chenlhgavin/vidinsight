'use client';

import { Globe, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUPPORTED_LANGUAGES, getLanguageName } from '@/lib/language-utils';

interface Props {
  selectedLanguage: string | null;
  preferredLanguage?: string;
  currentSourceLanguage?: string;
  isAuthenticated: boolean;
  onLanguageChange: (languageCode: string | null) => void;
  onRequestSignIn: () => void;
}

export function LanguageSelector({
  selectedLanguage,
  preferredLanguage,
  currentSourceLanguage,
  isAuthenticated,
  onLanguageChange,
  onRequestSignIn,
}: Props) {
  const sourceLanguage = currentSourceLanguage || 'en';
  const fallbackTarget =
    SUPPORTED_LANGUAGES.find((language) => language.code !== sourceLanguage)?.code ?? 'en';
  const defaultTarget = preferredLanguage && preferredLanguage !== sourceLanguage
    ? preferredLanguage
    : fallbackTarget;

  const handleSelect = (languageCode: string) => {
    if (!languageCode || languageCode === sourceLanguage) {
      onLanguageChange(null);
      return;
    }

    if (!isAuthenticated) {
      onRequestSignIn();
      return;
    }

    onLanguageChange(languageCode);
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {selectedLanguage
            ? `Translating to ${getLanguageName(selectedLanguage)}`
            : `Original ${getLanguageName(sourceLanguage)}`}
        </span>
      </div>
      <select
        value={selectedLanguage ?? ''}
        onChange={(event) => handleSelect(event.target.value)}
        className="h-8 max-w-[180px] rounded-lg border border-border bg-surface-3 px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Original</option>
        {SUPPORTED_LANGUAGES.filter((language) => language.code !== sourceLanguage).map((language) => (
          <option key={language.code} value={language.code}>
            {language.nativeName}
          </option>
        ))}
      </select>
      {!isAuthenticated && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRequestSignIn}
          className="h-8 shrink-0 px-2 text-xs"
        >
          <LockKeyhole className="h-3 w-3" />
          Sign in
        </Button>
      )}
      {isAuthenticated && !selectedLanguage && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleSelect(defaultTarget)}
          className="h-8 shrink-0 px-2 text-xs"
        >
          Translate
        </Button>
      )}
    </div>
  );
}

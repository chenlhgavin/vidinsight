export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文' },
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
] as const;

export function getLanguageName(code: string | null | undefined): string {
  if (!code) return 'English';

  const supported = SUPPORTED_LANGUAGES.find((language) => language.code === code);
  if (supported) return supported.name;

  try {
    const displayName = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    if (displayName && displayName !== code) return displayName;
  } catch {
    // Fall through to code fallback for invalid or unsupported language codes.
  }

  return code.toUpperCase();
}

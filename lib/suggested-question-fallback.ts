export const PRIMARY_FALLBACKS = [
  'What evidence backs the main claim?',
  'How do the key steps connect?',
  'Why does this insight matter now?',
  'What example clarifies the takeaway?',
  'How can I apply this idea today?',
] as const;

export const SUPPLEMENTAL_FALLBACKS = [
  'Which detail should I double-check in the transcript?',
  'Where does the speaker justify this idea?',
] as const;

export const CYCLIC_FILLERS = [
  'What detail should I revisit in the transcript?',
  'Which statement deserves closer scrutiny?',
] as const;

export const ALL_FALLBACK_QUESTIONS = [
  ...PRIMARY_FALLBACKS,
  ...SUPPLEMENTAL_FALLBACKS,
  ...CYCLIC_FILLERS,
] as const;

function normalize(items?: Iterable<string>): Set<string> {
  const out = new Set<string>();
  if (!items) return out;
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.add(trimmed.toLowerCase());
  }
  return out;
}

export function buildSuggestedQuestionFallbacks(
  count = 3,
  exclude?: Iterable<string>,
  existing?: Iterable<string>,
): string[] {
  const normalizedExclude = normalize(exclude);
  const normalizedExisting = normalize(existing);
  const results: string[] = [];

  const push = (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const lowered = trimmed.toLowerCase();
    if (normalizedExclude.has(lowered) || normalizedExisting.has(lowered)) return;
    if (results.some((q) => q.toLowerCase() === lowered)) return;
    results.push(trimmed);
    normalizedExisting.add(lowered);
  };

  for (const candidate of PRIMARY_FALLBACKS) {
    push(candidate);
    if (results.length >= count) return results.slice(0, count);
  }
  for (const candidate of SUPPLEMENTAL_FALLBACKS) {
    push(candidate);
    if (results.length >= count) return results.slice(0, count);
  }
  let fillerIndex = 0;
  while (results.length < count && fillerIndex < 10) {
    push(CYCLIC_FILLERS[fillerIndex % CYCLIC_FILLERS.length]);
    fillerIndex += 1;
  }
  return results.slice(0, count);
}

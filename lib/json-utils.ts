export function preprocessJsonResponse(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw;
  let cleaned = raw;
  cleaned = cleaned.replace(/^\uFEFF/, '');
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.trim();
}

export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const arr = trimmed.match(/\[[\s\S]*\]/);
  if (arr) return arr[0];
  const obj = trimmed.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return trimmed;
}

export function repairJson(raw: string): string {
  let cleaned = extractJsonPayload(raw);
  if (!cleaned) return cleaned;

  const incompleteString = cleaned.match(/,\s*"[^"]*"\s*:\s*"[^"]*$/);
  if (incompleteString) {
    const lastCompleteComma = cleaned.lastIndexOf(',', cleaned.length - incompleteString[0].length);
    if (lastCompleteComma > 0) {
      cleaned = cleaned.substring(0, lastCompleteComma);
    }
  }

  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;

  for (let i = 0; i < openBraces - closeBraces; i++) cleaned += '}';
  for (let i = 0; i < openBrackets - closeBrackets; i++) cleaned += ']';

  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  cleaned = cleaned.replace(/,\s*$/, '');
  return cleaned;
}

export function safeJsonParse<T = unknown>(raw: string): T {
  const preprocessed = preprocessJsonResponse(raw);
  const cleaned = extractJsonPayload(preprocessed);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const repaired = repairJson(preprocessed);
    return JSON.parse(repaired) as T;
  }
}

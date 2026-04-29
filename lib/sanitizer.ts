import createDOMPurify from 'dompurify';

let purifier: ReturnType<typeof createDOMPurify> | null = null;

async function getPurifier() {
  if (purifier) return purifier;
  if (typeof window !== 'undefined') {
    purifier = createDOMPurify(window);
    return purifier;
  }
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html>');
  // jsdom Window is structurally a superset of dompurify's WindowLike but their
  // .d.ts files don't quite line up — cast through unknown.
  purifier = createDOMPurify(dom.window as unknown as Parameters<typeof createDOMPurify>[0]);
  return purifier;
}

export async function sanitizeMarkdown(md: string): Promise<string> {
  const p = await getPurifier();
  return p.sanitize(md, { USE_PROFILES: { html: true } });
}

export async function sanitizeRequestBody<T>(input: T): Promise<T> {
  const p = await getPurifier();
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') return p.sanitize(v);
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = visit(val);
      return out;
    }
    return v;
  };
  return visit(input) as T;
}

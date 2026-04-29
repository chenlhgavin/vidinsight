const TOKEN_COOKIE = 'csrf-token';

let cachedToken: string | null = null;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function ensureToken(): Promise<string | null> {
  const existing = readCookie(TOKEN_COOKIE);
  if (existing) {
    cachedToken = existing;
    return existing;
  }
  if (cachedToken) return cachedToken;
  try {
    const r = await fetch('/api/csrf-token', { credentials: 'include' });
    if (!r.ok) return null;
    const data = (await r.json()) as { token?: string };
    cachedToken = data.token ?? readCookie(TOKEN_COOKIE);
    return cachedToken;
  } catch {
    return null;
  }
}

export function clearCsrfTokenCache() {
  cachedToken = null;
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? {});
  if (STATE_CHANGING.has(method)) {
    const token = await ensureToken();
    if (token) headers.set('X-CSRF-Token', token);
  }
  return fetch(input, { ...init, headers, credentials: init.credentials ?? 'include' });
}

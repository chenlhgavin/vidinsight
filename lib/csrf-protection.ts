import { randomBytes, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'csrf-token';
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HEADER_NAME = 'x-csrf-token';
const COOKIE_MAX_AGE = 60 * 60 * 24;

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export async function readCsrfCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setCsrfCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: false, // needs to be readable by csrfFetch on client
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function ensureCsrfCookie(): Promise<string> {
  const existing = await readCsrfCookie();
  if (existing) return existing;
  const token = generateCsrfToken();
  await setCsrfCookie(token);
  return token;
}

export async function validateCsrf(request: Request): Promise<boolean> {
  if (!STATE_CHANGING.has(request.method.toUpperCase())) return true;
  const headerToken = request.headers.get(HEADER_NAME);
  const cookieToken = await readCsrfCookie();
  if (!headerToken || !cookieToken) return false;
  if (headerToken.length !== cookieToken.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(headerToken, 'hex'),
      Buffer.from(cookieToken, 'hex'),
    );
  } catch {
    return false;
  }
}

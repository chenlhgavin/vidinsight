import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { identifierForRequest } from '@/lib/rate-limiter';

export const GUEST_TOKEN_COOKIE = 'vidinsight_guest_token';
export const GUEST_USED_COOKIE = 'vidinsight_guest_used';
export const GUEST_RATE_KEY = 'guest-analysis';
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5;

export interface GuestAccessState {
  token: string;
  tokenNeedsSet: boolean;
  used: boolean;
  identifiers: string[];
}

export async function getGuestAccessState(
  request: Request,
  opts?: { supabase?: SupabaseClient },
): Promise<GuestAccessState> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(GUEST_TOKEN_COOKIE)?.value ?? null;
  const usedCookie = cookieStore.get(GUEST_USED_COOKIE)?.value === '1';

  const token = existingToken && existingToken.length > 0 ? existingToken : randomUUID();
  const tokenNeedsSet = !existingToken;

  const ipHash = await identifierForRequest(request, null);
  const identifiers = [token, `ip:${ipHash}`];

  if (usedCookie) {
    return { token, tokenNeedsSet, used: true, identifiers };
  }

  const supabase = opts?.supabase ?? createServiceRoleClient();
  const { count } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('key', GUEST_RATE_KEY)
    .in('identifier', identifiers);

  return {
    token,
    tokenNeedsSet,
    used: (count ?? 0) > 0,
    identifiers,
  };
}

export function setGuestCookies(
  response: NextResponse,
  state: GuestAccessState,
  opts?: { markUsed?: boolean },
): void {
  const base = {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE,
  };

  if (state.tokenNeedsSet) {
    response.cookies.set(GUEST_TOKEN_COOKIE, state.token, base);
  }
  if (opts?.markUsed) {
    response.cookies.set(GUEST_USED_COOKIE, '1', base);
  }
}

export async function recordGuestUsage(
  state: GuestAccessState,
  opts?: { supabase?: SupabaseClient },
): Promise<void> {
  const supabase = opts?.supabase ?? createServiceRoleClient();
  const timestamp = new Date().toISOString();
  const rows = state.identifiers.map((identifier) => ({
    key: GUEST_RATE_KEY,
    identifier,
    timestamp,
  }));
  await supabase.from('rate_limits').insert(rows);
}

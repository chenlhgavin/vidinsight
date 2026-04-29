import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { SecurityContext } from '@/lib/security-middleware';
import {
  getGuestAccessState,
  setGuestCookies,
  type GuestAccessState,
} from '@/lib/guest-usage';

export type GuestGateResult =
  | { ok: true; user: User | null; guestState: GuestAccessState | null }
  | { ok: false; response: NextResponse };

export interface GuestGateOptions {
  isPrimaryAnalysis?: boolean;
  isCachedHit?: boolean;
}

export async function gateGuestForGeneration(
  request: Request,
  ctx: SecurityContext,
  options: GuestGateOptions = {},
): Promise<GuestGateResult> {
  if (ctx.user) {
    return { ok: true, user: ctx.user, guestState: null };
  }

  const guestState = await getGuestAccessState(request);
  const blockPrimary =
    guestState.used && options.isPrimaryAnalysis === true && options.isCachedHit !== true;

  if (blockPrimary) {
    const response = NextResponse.json(
      {
        error: 'auth_required',
        message: "You've used your free preview. Sign in to keep going.",
        requiresAuth: true,
        redirectTo: '/?auth=limit',
      },
      { status: 401 },
    );
    setGuestCookies(response, guestState);
    return { ok: false, response };
  }

  return { ok: true, user: null, guestState };
}

export function finalizeGuestResponse(
  response: NextResponse,
  guestState: GuestAccessState | null,
  opts: { consumed: boolean },
): NextResponse {
  if (guestState) {
    setGuestCookies(response, guestState, { markUsed: opts.consumed });
  }
  return response;
}

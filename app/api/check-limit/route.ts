import { NextResponse } from 'next/server';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { getGuestAccessState, setGuestCookies } from '@/lib/guest-usage';

export const runtime = 'nodejs';

export const GET = withSecurity(SECURITY_PRESETS.PUBLIC, async (request, ctx) => {
  if (ctx.user) {
    return NextResponse.json({
      canGenerate: true,
      isAuthenticated: true,
      tier: 'free',
      reason: null,
      requiresAuth: false,
      resetAt: null,
      usage: {
        baseLimit: null,
        baseRemaining: null,
        totalRemaining: null,
      },
    });
  }

  const guestState = await getGuestAccessState(request);
  const canGenerate = !guestState.used;
  const remaining = canGenerate ? 1 : 0;

  const response = NextResponse.json({
    canGenerate,
    isAuthenticated: false,
    tier: 'anonymous',
    reason: canGenerate ? null : 'AUTH_REQUIRED',
    requiresAuth: !canGenerate,
    resetAt: null,
    usage: {
      baseLimit: 1,
      baseRemaining: remaining,
      totalRemaining: remaining,
    },
  });
  setGuestCookies(response, guestState);
  return response;
});

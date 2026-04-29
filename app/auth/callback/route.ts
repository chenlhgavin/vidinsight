import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveAppUrl } from '@/lib/utils';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const baseOrigin = resolveAppUrl(origin) || origin;
  return NextResponse.redirect(new URL(next, baseOrigin));
}

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  try {
    const { error } = await supabase.auth.getUser();
    if (error) {
      if (
        error.message?.includes('refresh_token_not_found') ||
        error.message?.includes('Invalid Refresh Token')
      ) {
        const authCookies = request.cookies
          .getAll()
          .filter(
            (c) =>
              c.name.startsWith('sb-') &&
              (c.name.includes('auth-token') || c.name.includes('refresh-token')),
          );
        authCookies.forEach((c) => supabaseResponse.cookies.delete(c.name));
      }
    }
  } catch (error) {
    console.error('Unexpected error in auth middleware:', error);
  }

  return supabaseResponse;
}

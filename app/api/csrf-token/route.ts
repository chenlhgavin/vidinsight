import { NextResponse } from 'next/server';
import { ensureCsrfCookie } from '@/lib/csrf-protection';

export const runtime = 'nodejs';

export async function GET() {
  const token = await ensureCsrfCookie();
  return NextResponse.json({ token });
}

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase
    .from('rate_limits')
    .delete({ count: 'estimated' })
    .lt('timestamp', cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? null });
}

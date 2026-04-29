import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase client missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return { url: url.replace(/\/+$/, ''), key };
}

export function createClient() {
  const { url, key } = getSupabaseConfig();
  return createBrowserClient<Database>(url, key);
}

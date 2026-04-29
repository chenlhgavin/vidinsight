import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const globalForSupabase = globalThis as typeof globalThis & {
  __supabaseServiceClient?: ReturnType<typeof createClient<Database>>;
};

export function createServiceRoleClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  if (!globalForSupabase.__supabaseServiceClient) {
    globalForSupabase.__supabaseServiceClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { 'X-Client-Info': 'vidinsight-service-role' } },
      },
    );
  }
  return globalForSupabase.__supabaseServiceClient;
}

import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export interface RateLimitOptions {
  key: string;
  identifier: string;
  windowMs: number;
  max: number;
  countOnly?: boolean;
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfter?: number;
}

export function ratelimitKey(scope: string, identifier: string): string {
  return `ratelimit:${scope}:${identifier}`;
}

export async function identifierForRequest(
  request: Request,
  userId?: string | null,
): Promise<string> {
  if (userId) return userId;
  const headers = request.headers;
  const fwd =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    'anon';
  return createHash('sha256').update(fwd).digest('hex').slice(0, 16);
}

export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitStatus> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - opts.windowMs).toISOString();

  const { count } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('key', opts.key)
    .gte('timestamp', since);

  const used = count ?? 0;
  const remaining = Math.max(0, opts.max - used);
  const allowed = used < opts.max;

  if (allowed && !opts.countOnly) {
    await supabase.from('rate_limits').insert({
      key: opts.key,
      identifier: opts.identifier,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    allowed,
    remaining: allowed ? remaining - (opts.countOnly ? 0 : 1) : 0,
    limit: opts.max,
    retryAfter: allowed ? undefined : Math.ceil(opts.windowMs / 1000),
  };
}

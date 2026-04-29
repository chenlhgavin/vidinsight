import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCsrf } from '@/lib/csrf-protection';
import { rateLimit, ratelimitKey, identifierForRequest } from '@/lib/rate-limiter';
import { logAuditEvent } from '@/lib/audit-logger';
import { sanitizeRequestBody } from '@/lib/sanitizer';
import type { User } from '@supabase/supabase-js';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface SecurityPreset {
  name: string;
  methods: ('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')[];
  rateLimit: { windowMs: number; max: number };
  bodyMaxBytes: number;
  requireAuth: boolean;
  requireCsrf: boolean | 'mutating';
  sanitizeBody?: boolean;
  auditAction?: string;
}

export const SECURITY_PRESETS: Record<string, SecurityPreset> = {
  PUBLIC: {
    name: 'public',
    methods: ['GET', 'POST'],
    rateLimit: { windowMs: 60_000, max: 30 },
    bodyMaxBytes: 1 * 1024 * 1024,
    requireAuth: false,
    requireCsrf: 'mutating',
  },
  AUTHENTICATED: {
    name: 'authenticated',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    rateLimit: { windowMs: 60_000, max: 60 },
    bodyMaxBytes: 5 * 1024 * 1024,
    requireAuth: true,
    requireCsrf: 'mutating',
    sanitizeBody: true,
  },
  AUTHENTICATED_READ_ONLY: {
    name: 'authenticated_read_only',
    methods: ['GET'],
    rateLimit: { windowMs: 60_000, max: 120 },
    bodyMaxBytes: 1 * 1024 * 1024,
    requireAuth: true,
    requireCsrf: false,
  },
  STRICT: {
    name: 'strict',
    methods: ['POST'],
    rateLimit: { windowMs: 60_000, max: 10 },
    bodyMaxBytes: 512 * 1024,
    requireAuth: true,
    requireCsrf: true,
    sanitizeBody: true,
  },
  AI_GENERATION: {
    name: 'ai_generation',
    methods: ['POST'],
    rateLimit: { windowMs: 60_000, max: 6 },
    bodyMaxBytes: 8 * 1024 * 1024,
    requireAuth: false,
    requireCsrf: true,
    sanitizeBody: false,
  },
  PUBLIC_LARGE: {
    name: 'public_large',
    methods: ['GET', 'POST'],
    rateLimit: { windowMs: 60_000, max: 30 },
    bodyMaxBytes: 8 * 1024 * 1024,
    requireAuth: false,
    requireCsrf: 'mutating',
    sanitizeBody: false,
  },
};

export interface SecurityContext {
  user: User | null;
  identifier: string;
  parsedBody: unknown;
  preset: SecurityPreset;
}

type Handler = (request: Request, ctx: SecurityContext) => Promise<Response>;

function applySecurityHeaders(res: Response): Response {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

export function withSecurity(preset: SecurityPreset, handler: Handler) {
  return async (request: Request) => {
    const method = request.method.toUpperCase() as (typeof preset.methods)[number];
    if (!preset.methods.includes(method)) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'method_not_allowed' }, { status: 405 }),
      );
    }

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (preset.requireAuth && !user) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
      );
    }

    const identifier = await identifierForRequest(request, user?.id);
    const status = await rateLimit({
      key: ratelimitKey(preset.name, identifier),
      identifier,
      windowMs: preset.rateLimit.windowMs,
      max: preset.rateLimit.max,
    });
    if (!status.allowed) {
      const res = NextResponse.json({ error: 'rate_limited' }, { status: 429 });
      if (status.retryAfter) res.headers.set('Retry-After', String(status.retryAfter));
      return applySecurityHeaders(res);
    }

    const csrfNeeded =
      preset.requireCsrf === true ||
      (preset.requireCsrf === 'mutating' && STATE_CHANGING.has(method));
    if (csrfNeeded) {
      const ok = await validateCsrf(request);
      if (!ok) {
        await logAuditEvent({
          userId: user?.id,
          action: 'csrf.rejected',
          resourceType: 'request',
          details: { url: request.url, method },
        });
        return applySecurityHeaders(
          NextResponse.json({ error: 'csrf_invalid' }, { status: 403 }),
        );
      }
    }

    let parsedBody: unknown = null;
    if (STATE_CHANGING.has(method)) {
      const len = parseInt(request.headers.get('content-length') ?? '0', 10);
      if (len > preset.bodyMaxBytes) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'body_too_large' }, { status: 413 }),
        );
      }
      const ct = request.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        try {
          parsedBody = await request.clone().json();
          if (preset.sanitizeBody) parsedBody = await sanitizeRequestBody(parsedBody);
        } catch {
          parsedBody = null;
        }
      }
    }

    let response: Response;
    try {
      response = await handler(request, { user, identifier, parsedBody, preset });
    } catch (err) {
      console.error('[withSecurity] handler error', err);
      response = NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    if (preset.auditAction) {
      await logAuditEvent({
        userId: user?.id,
        action: preset.auditAction,
        resourceType: 'request',
        details: { method, status: response.status },
      });
    }
    return applySecurityHeaders(response);
  };
}

import { createServiceRoleClient } from '@/lib/supabase/admin';
import { backgroundOperation } from '@/lib/promise-utils';

interface AuditEvent {
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipHash?: string | null;
  userAgent?: string | null;
}

export async function logAuditEvent(event: AuditEvent) {
  await backgroundOperation('audit-log', async () => {
    const supabase = createServiceRoleClient();
    await supabase.from('audit_logs').insert({
      user_id: event.userId ?? null,
      action: event.action,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      details: event.details ?? null,
      ip_hash: event.ipHash ?? null,
      user_agent: event.userAgent ?? null,
    });
  });
}

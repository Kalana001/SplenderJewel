'use server';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type { AuditLogEntry, AuditLogFilter } from '@/types/audit';

/**
 * Sanitizes details dictionary to strictly exclude tokens, passwords, and secrets.
 */
function sanitizeAuditDetails(details: any): Record<string, any> {
  if (!details || typeof details !== 'object') return {};

  const clean: Record<string, any> = {};
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'bearer', 'service_role', 'order_token'];

  for (const [k, v] of Object.entries(details)) {
    const isSensitive = sensitiveKeys.some((s) => k.toLowerCase().includes(s));
    if (isSensitive) {
      clean[k] = '[REDACTED_FOR_SECURITY]';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      clean[k] = sanitizeAuditDetails(v);
    } else {
      clean[k] = v;
    }
  }

  return clean;
}

export async function getAdminAuditLogs(filter: AuditLogFilter = {}): Promise<{
  success: boolean;
  logs: AuditLogEntry[];
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    let query = (adminClient.from('audit_logs') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(filter.limit || 50);

    if (filter.resourceType && filter.resourceType !== 'all') {
      query = query.eq('resource_type', filter.resourceType);
    }

    if (filter.action && filter.action !== 'all') {
      query = query.eq('action', filter.action);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, logs: [], error: error.message };
    }

    const logs: AuditLogEntry[] = (data || []).map((row: any) => ({
      id: row.id,
      adminId: row.admin_id,
      adminEmail: row.admin_email,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details: row.details,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    }));

    return { success: true, logs };
  } catch (err: any) {
    return { success: false, logs: [], error: err.message || 'Failed to fetch audit logs.' };
  }
}

export async function recordAdminAuditLog(input: {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, any>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    const sanitizedDetails = sanitizeAuditDetails(input.details);

    await (adminClient.from('audit_logs') as any).insert({
      admin_id: admin.id,
      admin_email: admin.email,
      action: input.action.toUpperCase(),
      resource_type: input.resourceType.toUpperCase(),
      resource_id: input.resourceId || null,
      details: sanitizedDetails,
      ip_address: input.ipAddress || null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Audit logging fails open to avoid breaking primary workflows
  }
}

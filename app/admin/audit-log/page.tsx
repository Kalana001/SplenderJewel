import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminAuditLogs } from '@/lib/audit/admin-actions';
import { AuditLogViewer } from '@/components/admin/audit/audit-log-viewer';

export const metadata = {
  title: 'Security Audit Log | Splender Jewel Admin',
  description: 'Immutable trail of administrative operations, pricing adjustments, fulfillment transitions, and settings changes',
};

export default async function AdminAuditLogPage() {
  await requireAdminPageAuth();

  const res = await getAdminAuditLogs({ limit: 50 });
  const logs = res.success ? res.logs : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Admin Security Audit Trail
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Immutable log of administrative operations with automated redaction of sensitive credentials and tokens.
          </p>
        </div>
      </div>

      <AuditLogViewer initialLogs={logs} />
    </div>
  );
}

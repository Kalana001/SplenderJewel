import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminAuditLogPage() {
  return (
    <AdminPageSkeleton
      title="Admin Security Audit Log"
      category="Security & Access"
      description="Immutable audit trail recording administrative actions, price adjustments, order status transitions, and store settings updates."
      targetPhase="Phase 4 (Security & Audit Logging)"
      capabilities={[
        'Timestamped record of administrative operations',
        'Actor email and IP address logging',
        'Detailed diff of changed attributes',
        'Non-tamperable security log',
      ]}
    />
  );
}

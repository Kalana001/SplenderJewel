import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminReportsPage() {
  return (
    <AdminPageSkeleton
      title="Analytics & Business Reports"
      category="Reporting & Insights"
      description="Sales performance, gross profit calculation using confidential purchase costs, top-selling jewelry pieces, and district order distributions."
      targetPhase="Phase 4 (Analytics & Advanced Administration)"
      capabilities={[
        'Total revenue, orders volume, and average order value (AOV)',
        'Gross profit reporting computed from variant purchase costs (Admin only)',
        'Sales by category and individual product variant performance',
        'Geographic breakdown by Sri Lanka district',
      ]}
    />
  );
}

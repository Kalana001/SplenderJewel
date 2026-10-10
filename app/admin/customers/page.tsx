import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminCustomersPage() {
  return (
    <AdminPageSkeleton
      title="Customer Directory"
      category="Customer Management"
      description="View registered customer accounts, order counts, lifetime order values, and saved delivery addresses."
      targetPhase="Phase 3 (Customer Account & Orders)"
      capabilities={[
        'Customer search and contact directory',
        'Registered profile details and phone numbers',
        'Customer order history and delivery address records',
      ]}
    />
  );
}

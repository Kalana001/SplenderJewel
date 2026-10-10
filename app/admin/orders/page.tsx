import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminOrdersPage() {
  return (
    <AdminPageSkeleton
      title="Orders Management"
      category="Sales & Operations"
      description="Track customer orders across full lifecycle: Pending -> Confirmed -> Processing -> Shipped -> Delivered. Verify manual WhatsApp bank transfers."
      targetPhase="Phase 3 (Orders & Checkout Execution)"
      capabilities={[
        'Filter by status (Pending, Confirmed, Shipped, Delivered)',
        'Human-readable order sequence (SJ-YYYYMMDD-XXXX)',
        'WhatsApp Bank Transfer approval / rejection',
        'Customer contact & Sri Lanka district shipping details',
      ]}
    />
  );
}

import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminReviewsPage() {
  return (
    <AdminPageSkeleton
      title="Product Reviews Moderation"
      category="Customer Content"
      description="Moderate, approve, and manage customer product reviews submitted for delivered orders."
      targetPhase="Phase 4 (Reviews & Moderation)"
      capabilities={[
        'Review moderation queue (Pending, Approved, Rejected)',
        'Verification that reviewer purchased and received the product',
        'Customer star rating, review commentary, and date stamp',
      ]}
    />
  );
}

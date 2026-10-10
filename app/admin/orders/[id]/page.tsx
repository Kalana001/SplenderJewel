import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;

  return (
    <AdminPageSkeleton
      title={`Order Detail: #${id}`}
      category="Orders Management"
      description="Inspect order items, customer address, payment verification status, tracking number assignment, and package label printing."
      targetPhase="Phase 3 (Orders & Checkout Execution)"
      capabilities={[
        'Full line items with variants, quantities, and selling prices',
        'Confidential purchase cost and profit calculation (Admin only)',
        'Order status transitions with audit history notes',
        'Customer package shipping label generation',
      ]}
    />
  );
}

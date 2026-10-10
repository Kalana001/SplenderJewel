import { StorePageSkeleton } from '@/components/store/store-page-skeleton';

interface AccountOrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function AccountOrderDetailPage({ params }: AccountOrderDetailPageProps) {
  const { orderId } = await params;

  return (
    <StorePageSkeleton
      title={`Order Details: #${orderId}`}
      category="Customer Account"
      description="Detailed receipt, tracking status, courier details, and itemized receipt for this order."
      phase="Phase 3 (Cart, Checkout & Orders)"
    />
  );
}

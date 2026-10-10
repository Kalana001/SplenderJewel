import { StorePageSkeleton } from '@/components/store/store-page-skeleton';

interface OrderConfirmationPageProps {
  params: Promise<{ orderNumber: string }>;
}

export default async function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { orderNumber } = await params;

  return (
    <StorePageSkeleton
      title={`Order Confirmation: ${orderNumber}`}
      category="Order Status"
      description="Clear summary of your order, delivery details, and WhatsApp verification instructions for bank transfer orders."
      phase="Phase 3 (Cart, Checkout & Orders)"
    />
  );
}

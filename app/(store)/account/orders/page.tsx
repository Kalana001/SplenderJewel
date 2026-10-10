import { StorePageSkeleton } from '@/components/store/store-page-skeleton';

export default function AccountOrdersPage() {
  return (
    <StorePageSkeleton
      title="Order History"
      category="Customer Account"
      description="View full past and active orders with lifecycle statuses (Pending -> Confirmed -> Processing -> Shipped -> Delivered)."
      phase="Phase 3 (Cart, Checkout & Orders)"
    />
  );
}

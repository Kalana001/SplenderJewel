import { StorePageSkeleton } from '@/components/store/store-page-skeleton';

export default function RegisterPage() {
  return (
    <StorePageSkeleton
      title="Create an Account"
      category="Authentication"
      description="Create a customer account to track orders, save multiple delivery addresses, and manage your wishlist."
      phase="Phase 1 (Authentication & Profiles)"
    />
  );
}

import { StorePageSkeleton } from '@/components/store/store-page-skeleton';

export default function LoginPage() {
  return (
    <StorePageSkeleton
      title="Customer Sign In"
      category="Authentication"
      description="Secure customer email + password login (Google login excluded as per specification). Guest shopping remains accessible without an account."
      phase="Phase 1 (Authentication & Profiles)"
    />
  );
}

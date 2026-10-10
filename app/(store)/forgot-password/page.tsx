import { StorePageSkeleton } from '@/components/store/store-page-skeleton';

export default function ForgotPasswordPage() {
  return (
    <StorePageSkeleton
      title="Reset Password"
      category="Authentication"
      description="Enter your registered email address to receive secure password reset instructions."
      phase="Phase 1 (Authentication & Profiles)"
    />
  );
}

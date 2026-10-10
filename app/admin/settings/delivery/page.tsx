import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminDeliverySettingsPage() {
  return (
    <AdminPageSkeleton
      title="Delivery Matrix (25 Sri Lanka Districts)"
      category="Settings"
      description="Manage home delivery rates for all 25 administrative districts in Sri Lanka, configure estimated delivery days, and toggle free delivery options."
      targetPhase="Phase 3 (Delivery Matrix & Checkout)"
      capabilities={[
        'Configure custom delivery fee per district (Colombo, Gampaha, Kandy, Galle, etc.)',
        'Set estimated delivery timelines per district',
        'Toggle free delivery threshold (initially set to OFF)',
        'Enable or disable home delivery to specific regions',
      ]}
    />
  );
}

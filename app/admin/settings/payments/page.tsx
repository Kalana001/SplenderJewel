import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminPaymentSettingsPage() {
  return (
    <AdminPageSkeleton
      title="Payment Methods & Instructions"
      category="Settings"
      description="Manage payment methods: Cash on Delivery (COD) and Bank Transfer with manual WhatsApp approval workflow."
      targetPhase="Phase 3 (Payments & Checkout)"
      capabilities={[
        'Toggle Cash on Delivery (COD) availability',
        'Configure Bank Account details for customer bank transfers',
        'Set custom WhatsApp verification instructions',
        'Extensible architecture ready for future payment gateways',
      ]}
    />
  );
}

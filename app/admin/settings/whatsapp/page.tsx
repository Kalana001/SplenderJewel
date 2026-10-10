import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminWhatsAppSettingsPage() {
  return (
    <AdminPageSkeleton
      title="WhatsApp Integration Settings"
      category="Settings"
      description="Configure official store WhatsApp number (+94764689907) and pre-filled message templates for bank transfer verification, product queries, and support."
      targetPhase="Phase 3 (WhatsApp & Customer Communication)"
      capabilities={[
        'Centralized WhatsApp contact number configuration',
        'Pre-filled message template for Bank Transfer verification',
        'Pre-filled message template for product enquiries',
        'Direct chat action placement controls across storefront',
      ]}
    />
  );
}

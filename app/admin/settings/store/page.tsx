import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminStoreSettingsPage() {
  return (
    <AdminPageSkeleton
      title="General Store Settings"
      category="Settings"
      description="Configure store identity, brand logo upload, store name, default currency (LKR), and announcement bar text."
      targetPhase="Phase 4 (Storefront Customization & CMS)"
      capabilities={[
        'Logo upload and management (custom business owner logo)',
        'Store name, tagline, and header notification bar',
        'Store contact email and default support information',
      ]}
    />
  );
}

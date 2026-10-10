import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminBannersPage() {
  return (
    <AdminPageSkeleton
      title="Promotional Banners"
      category="Storefront Management"
      description="Manage hero banners, mobile promotional graphics, headline copy, and call-to-action destination links."
      targetPhase="Phase 4 (Storefront Customization & CMS)"
      capabilities={[
        'Upload desktop and mobile responsive banner images',
        'Headline, sub-headline, and CTA button labels',
        'Display ordering and active date scheduling',
      ]}
    />
  );
}

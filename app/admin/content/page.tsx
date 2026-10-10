import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminContentPage() {
  return (
    <AdminPageSkeleton
      title="Store Content Pages"
      category="CMS & Content"
      description="Edit textual content for public store pages (About Us, FAQ, Shipping & Delivery, Returns & Exchanges, Privacy Policy, Terms of Service)."
      targetPhase="Phase 4 (Storefront Customization & CMS)"
      capabilities={[
        'Rich text and markdown editing for all informational pages',
        'SEO meta titles and meta descriptions per page',
        'Immediate live storefront updates without code deployment',
      ]}
    />
  );
}

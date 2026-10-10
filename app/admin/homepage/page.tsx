import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminHomepagePage() {
  return (
    <AdminPageSkeleton
      title="Homepage Layout & Sections"
      category="Storefront Management"
      description="Enable, disable, and reorder dynamic homepage sections (Hero, Featured Products, New Arrivals, Best Sellers, Category Grid, Customer Reviews)."
      targetPhase="Phase 4 (Storefront Customization & CMS)"
      capabilities={[
        'Toggle visibility of homepage sections without modifying code',
        'Drag-and-drop / numeric section ordering',
        'Section titles, subtitles, and featured collection bindings',
      ]}
    />
  );
}

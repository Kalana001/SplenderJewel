import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminPrintTemplatePage() {
  return (
    <AdminPageSkeleton
      title="Package Shipping Label Print Template"
      category="Settings"
      description="Configure physical package label print layout containing ONLY: Customer Name, Address, and Contact Number for order dispatch."
      targetPhase="Phase 4 (Package Printing & Operations)"
      capabilities={[
        'Clean printable label template containing exclusively Name, Address, and Contact Number',
        'Custom font size and label dimensions (standard thermal / A4)',
        'One-click print action directly from Order Details view',
      ]}
    />
  );
}

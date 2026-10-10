import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

interface AdminCustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCustomerDetailPage({ params }: AdminCustomerDetailPageProps) {
  const { id } = await params;

  return (
    <AdminPageSkeleton
      title={`Customer Detail: #${id}`}
      category="Customer Management"
      description="Inspect customer profile, order history, address book, and communication log."
      targetPhase="Phase 3 (Customer Account & Orders)"
      capabilities={[
        'Full customer profile details & contact numbers',
        'Customer orders breakdown and total spend',
        'Saved delivery addresses across Sri Lanka',
      ]}
    />
  );
}

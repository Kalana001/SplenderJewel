import React from 'react';
import { notFound } from 'next/navigation';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminOrderById } from '@/lib/orders/admin-actions';
import { OrderFulfillmentManager } from '@/components/admin/orders/order-fulfillment-manager';

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;
  return {
    title: `Fulfill Order #${id} | Splender Jewel Admin`,
  };
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  await requireAdminPageAuth();
  const { id } = await params;

  const res = await getAdminOrderById(id);
  if (!res.success || !res.order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <OrderFulfillmentManager order={res.order} />
    </div>
  );
}

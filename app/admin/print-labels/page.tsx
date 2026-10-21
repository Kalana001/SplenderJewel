import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getEligibleShippingOrdersAction } from '@/lib/shipping/admin-actions';
import { PrintLabelsManager } from '@/components/admin/shipping/print-labels-manager';

export const metadata = {
  title: 'Print Labels & Postal Export | Splender Jewel Admin',
  description: 'Generate customer package shipping labels and export Sri Lanka Post bulk upload files',
};

export default async function AdminPrintLabelsPage() {
  await requireAdminPageAuth();

  const res = await getEligibleShippingOrdersAction();
  const initialOrders = res.success ? res.orders : [];

  return <PrintLabelsManager initialOrders={initialOrders} />;
}

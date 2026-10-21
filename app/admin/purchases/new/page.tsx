import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { BatchCreateForm } from '@/components/admin/purchases/batch-create-form';
import { FeatureDisabledCard } from '@/components/admin/purchases/feature-disabled-card';

export const metadata = {
  title: 'New Purchase Batch | Splender Jewel Admin',
  description: 'Create a new supplier purchase order with items, variations, and landed cost allocation',
};

export default async function NewPurchaseBatchPage() {
  await requireAdminPageAuth();

  const isEnabled = process.env.NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT === 'true';

  return (
    <div className="space-y-6">
      {!isEnabled && (
        <FeatureDisabledCard
          isMockActive={true}
        />
      )}

      <BatchCreateForm />
    </div>
  );
}

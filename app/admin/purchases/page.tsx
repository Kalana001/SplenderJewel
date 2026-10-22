import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { 
  listPurchaseBatchesAction, 
  getMockPurchaseBatchesAction 
} from '@/lib/purchases/admin-actions';
import { BatchList } from '@/components/admin/purchases/batch-list';
import { FeatureDisabledCard } from '@/components/admin/purchases/feature-disabled-card';
import { AlertCircle } from 'lucide-react';
import type { PurchaseBatchDTO } from '@/lib/purchases/types';

export const metadata = {
  title: 'Purchase Batch Management | Splender Jewel Admin',
  description: 'Manage supplier purchases, track inventory arrivals, and reconcile landed costs',
};

export default async function AdminPurchasesPage() {
  await requireAdminPageAuth();

  const isEnabled = process.env.NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT === 'true';

  let batches: PurchaseBatchDTO[] = [];
  let isFeatureDisabled = !isEnabled;
  let isMissingMigration = false;
  let loadError: string | null = null;
  let isMockActive = false;

  if (isEnabled) {
    const res = await listPurchaseBatchesAction();
    if (res.success && res.batches) {
      batches = res.batches;
    } else if (res.isMissingMigration) {
      isMissingMigration = true;
      batches = [];
    } else {
      loadError = res.error || 'Failed to load purchase batches from the database.';
      batches = [];
    }
  } else {
    // When disabled, suppress real DB queries to protect schema, supply verified mock data for architectural demo
    const mockRes = await getMockPurchaseBatchesAction();
    batches = mockRes.batches;
    isMockActive = true;
  }

  return (
    <div className="space-y-6">
      {(isFeatureDisabled || isMissingMigration) && (
        <FeatureDisabledCard
          isMissingMigration={isMissingMigration}
          isMockActive={isMockActive}
        />
      )}

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-sm bg-red-950/40 border border-red-800/60 text-red-200 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs sm:text-sm">
            <div className="font-semibold text-red-100">
              Unable to Load Purchase Batches
            </div>
            <p className="text-red-300/90">
              {loadError}
            </p>
          </div>
        </div>
      )}

      <BatchList
        initialBatches={batches}
        isFeatureDisabled={isFeatureDisabled}
        isMissingMigration={isMissingMigration}
      />
    </div>
  );
}

import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { 
  getPurchaseBatchDetailAction, 
  getMockPurchaseBatchDetailAction 
} from '@/lib/purchases/admin-actions';
import { BatchDetailView } from '@/components/admin/purchases/batch-detail-view';
import { FeatureDisabledCard } from '@/components/admin/purchases/feature-disabled-card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import type { BatchDetailViewDataDTO } from '@/lib/purchases/types';

interface AdminPurchaseDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AdminPurchaseDetailPageProps) {
  const { id } = await params;
  return {
    title: `Purchase Batch ${id} | Splender Jewel Admin`,
    description: 'Detailed purchase batch line items, expense allocations, and receiving history',
  };
}

export default async function AdminPurchaseDetailPage({ params }: AdminPurchaseDetailPageProps) {
  await requireAdminPageAuth();
  const { id } = await params;

  const isEnabled = process.env.NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT === 'true';

  let batchData: BatchDetailViewDataDTO | null = null;
  let isMissingMigration = false;
  let isMock = false;

  if (isEnabled) {
    const res = await getPurchaseBatchDetailAction(id);
    if (res.success && res.data) {
      batchData = res.data;
    } else if (res.isMissingMigration) {
      isMissingMigration = true;
      const mockRes = await getMockPurchaseBatchDetailAction(id);
      if (mockRes.success && mockRes.data) {
        batchData = mockRes.data;
        isMock = true;
      }
    } else {
      // Check mock fallback
      const mockRes = await getMockPurchaseBatchDetailAction(id);
      if (mockRes.success && mockRes.data) {
        batchData = mockRes.data;
        isMock = true;
      }
    }
  } else {
    // When feature flag is disabled, suppress real DB queries and serve mock demonstration data
    const mockRes = await getMockPurchaseBatchDetailAction(id);
    if (mockRes.success && mockRes.data) {
      batchData = mockRes.data;
      isMock = true;
    }
  }

  if (!batchData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
          <Link href="/admin/purchases">
            <Button variant="outline" size="sm" className="h-9 w-9 p-0">
              <ArrowLeft className="w-4 h-4 text-neutral-400" />
            </Button>
          </Link>
          <h1 className="text-xl font-serif font-bold text-white">Purchase Batch Not Found</h1>
        </div>

        <div className="p-8 text-center space-y-3 bg-neutral-900/60 border border-neutral-800 rounded-sm">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
          <div className="text-white font-medium text-sm">Batch &quot;{id}&quot; does not exist</div>
          <p className="text-neutral-400 text-xs max-w-sm mx-auto">
            The requested purchase batch could not be found in active records or demonstration data.
          </p>
          <Link href="/admin/purchases">
            <Button variant="gold" size="sm" className="mt-2">
              Back to Purchase Batches
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(!isEnabled || isMissingMigration) && (
        <FeatureDisabledCard
          isMissingMigration={isMissingMigration}
          isMockActive={isMock}
        />
      )}

      <BatchDetailView data={batchData} isMock={isMock} />
    </div>
  );
}

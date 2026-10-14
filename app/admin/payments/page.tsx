import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminPaymentSettlements } from '@/lib/orders/admin-actions';
import { PaymentSettlementManager } from '@/components/admin/payments/payment-settlement-manager';

export const metadata = {
  title: 'Payment Settlements & Revenue Audit | Splender Jewel Admin',
  description: 'Manage manual COD courier settlements, verify WhatsApp bank transfers, and audit received revenue',
};

export default async function AdminPaymentsPage() {
  await requireAdminPageAuth();

  const res = await getAdminPaymentSettlements();
  const payments = res.success ? res.payments : [];
  const total = res.success ? res.total : 0;
  const metrics = res.success && res.metrics ? res.metrics : {
    totalOrders: 0,
    totalRevenue: 0,
    pendingReviewCount: 0,
    pendingBankTransferCount: 0,
    pendingCodSettlementCount: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Payment Settlements & Revenue Audit
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Manual courier COD settlement reconciliation, bank transfer approvals, and verified cashflow accounting.
          </p>
        </div>
      </div>

      <PaymentSettlementManager
        initialPayments={payments}
        total={total}
        metrics={metrics}
      />
    </div>
  );
}

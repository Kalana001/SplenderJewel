import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminPrintTemplateConfig } from '@/lib/settings/admin-actions';
import { PrintTemplateManager } from '@/components/admin/settings/print-template-manager';

export const metadata = {
  title: 'Shipping Label Template | Splender Jewel Admin',
  description: 'Configure physical package shipping labels and courier dispatch slips',
};

export default async function AdminPrintTemplatePage() {
  await requireAdminPageAuth();

  const res = await getAdminPrintTemplateConfig();
  const config = res.success
    ? res.config
    : {
        storeName: 'Splender Jewel',
        storePhone: '+94 76 468 9907',
        returnAddress: 'Splender Jewel Boutique, Colombo, Sri Lanka',
        showStoreLogo: true,
        fontSize: 'standard' as const,
        paperSize: 'thermal_4x6' as const,
        includeOrderDate: true,
        includeItemSummary: true,
        footerNotice: 'Fragile Fine Jewelry — Handle With Utmost Care',
      };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Package Shipping Label Print Template
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Configure thermal courier shipping labels (4&quot;x6&quot; or A4) with strict commercial privacy (no costs, internal notes, or tokens).
          </p>
        </div>
      </div>

      <PrintTemplateManager initialConfig={config} />
    </div>
  );
}

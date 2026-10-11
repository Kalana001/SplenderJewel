import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminHomepageSections } from '@/lib/cms/admin-actions';
import { HomepageSectionsManager } from '@/components/admin/cms/homepage-sections-manager';

export const metadata = {
  title: 'Homepage Layout | Splender Jewel Admin',
  description: 'Manage homepage sections, titles, and layout ordering',
};

export default async function AdminHomepagePage() {
  await requireAdminPageAuth();

  const res = await getAdminHomepageSections();
  const sections = res.success ? res.sections : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Homepage Layout & Sections
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Enable, disable, and rearrange storefront sections (Hero, Brand Pillars, Category Grid, Featured Products, Reviews).
          </p>
        </div>
      </div>

      <HomepageSectionsManager initialSections={sections} />
    </div>
  );
}

import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminContentPages } from '@/lib/cms/admin-actions';
import { ContentPagesManager } from '@/components/admin/cms/content-pages-manager';

export const metadata = {
  title: 'Content Pages | Splender Jewel Admin',
  description: 'Edit textual content and SEO meta tags for public store pages',
};

export default async function AdminContentPage() {
  await requireAdminPageAuth();

  const res = await getAdminContentPages();
  const pages = res.success ? res.pages : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Storefront Content & Informational Pages
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Manage markdown copy, customer policies, and SEO metadata for About Us, FAQ, Delivery, Returns, and Terms.
          </p>
        </div>
      </div>

      <ContentPagesManager initialPages={pages} />
    </div>
  );
}

import { redirect } from 'next/navigation';
import { requireAdminPageAuth } from '@/lib/auth/server';

export default async function AdminSettingsRootPage() {
  await requireAdminPageAuth();
  redirect('/admin/settings/store');
}

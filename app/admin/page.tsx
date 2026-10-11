import { redirect } from 'next/navigation';
import { requireAdminPageAuth } from '@/lib/auth/server';

export default async function AdminRootPage() {
  await requireAdminPageAuth();
  redirect('/admin/dashboard');
}

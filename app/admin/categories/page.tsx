import { getAdminCategories } from '@/lib/catalog/categories';
import { CategoriesManager } from '@/components/admin/categories-manager';
import { requireAdminPageAuth } from '@/lib/auth/server';

export const metadata = {
  title: 'Category Management | Splender Jewel Admin',
  description: 'Manage store categories and product taxonomy',
};

export default async function AdminCategoriesPage() {
  await requireAdminPageAuth();

  const result = await getAdminCategories();
  const categories = result.success ? result.categories : [];

  return (
    <div className="space-y-6">
      <CategoriesManager initialCategories={categories} />
    </div>
  );
}

import { searchAdminInventoryProductsAction } from '@/lib/catalog/variants';
import { InventoryManager } from '@/components/admin/inventory-manager';
import { requireAdminPageAuth } from '@/lib/auth/server';

export const metadata = {
  title: 'Inventory Control | Splender Jewel Admin',
  description: 'Track real-time stock levels and inventory movement logs',
};

export default async function AdminInventoryPage() {
  await requireAdminPageAuth();

  const initialSearch = await searchAdminInventoryProductsAction({ page: 1, limit: 10 });

  return (
    <div className="space-y-6">
      <InventoryManager
        initialProducts={initialSearch.success ? initialSearch.products : []}
        initialTotalCount={initialSearch.success ? initialSearch.totalCount : 0}
      />
    </div>
  );
}

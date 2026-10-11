import { getAdminInventoryVariants } from '@/lib/catalog/variants';
import { InventoryManager } from '@/components/admin/inventory-manager';
import { requireAdminPageAuth } from '@/lib/auth/server';

export const metadata = {
  title: 'Inventory Control | Splender Jewel Admin',
  description: 'Track real-time stock levels and inventory movement logs',
};

export default async function AdminInventoryPage() {
  await requireAdminPageAuth();

  const result = await getAdminInventoryVariants();
  const variants = result.success ? result.variants : [];

  return (
    <div className="space-y-6">
      <InventoryManager initialVariants={variants} />
    </div>
  );
}

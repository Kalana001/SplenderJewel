import { getAdminProducts } from '@/lib/catalog/products';
import { getPublicCategories } from '@/lib/catalog/categories';
import { ProductsList } from '@/components/admin/products-list';

export const metadata = {
  title: 'Products & Variants | Splender Jewel Admin',
  description: 'Manage store jewelry catalog, variants, and stock',
};

export default async function AdminProductsPage() {
  const [productsRes, categories] = await Promise.all([
    getAdminProducts(),
    getPublicCategories(),
  ]);

  const products = productsRes.success ? productsRes.products : [];

  return (
    <div className="space-y-6">
      <ProductsList initialProducts={products} categories={categories} />
    </div>
  );
}

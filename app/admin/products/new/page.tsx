import { getPublicCategories } from '@/lib/catalog/categories';
import { ProductForm } from '@/components/admin/product-form';

export const metadata = {
  title: 'New Product | Splender Jewel Admin',
  description: 'Create a new fine jewelry product with variants and pricing',
};

export default async function AdminNewProductPage() {
  const categories = await getPublicCategories();

  return (
    <div className="py-2">
      <ProductForm categories={categories} />
    </div>
  );
}

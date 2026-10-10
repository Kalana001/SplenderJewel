import { notFound } from 'next/navigation';
import { getAdminProductById } from '@/lib/catalog/products';
import { getPublicCategories } from '@/lib/catalog/categories';
import { ProductEditManager } from '@/components/admin/product-edit-manager';

export const metadata = {
  title: 'Edit Product | Splender Jewel Admin',
  description: 'Manage jewelry product details, variants, gallery images, and stock',
};

interface AdminEditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditProductPage({ params }: AdminEditProductPageProps) {
  const { id } = await params;

  const [productRes, categories] = await Promise.all([
    getAdminProductById(id),
    getPublicCategories(),
  ]);

  if (!productRes.success || !productRes.product) {
    notFound();
  }

  return (
    <div className="py-2">
      <ProductEditManager initialProduct={productRes.product} categories={categories} />
    </div>
  );
}

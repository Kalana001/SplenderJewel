import React, { Suspense } from 'react';
import { getPublicProducts, getPublicMaterials } from '@/lib/catalog/public';
import { getPublicCategories } from '@/lib/catalog/categories';
import { CatalogBrowser } from '@/components/store/catalog-browser';
import { Container } from '@/components/ui/container';

export const revalidate = 300;

export const metadata = {
  title: 'Jewellery Catalog',
  description: 'Explore the full fashion jewellery collection by Splender Jewel. Rings, necklaces, bracelets, and earrings with Islandwide Delivery.',
};

interface ShopPageProps {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    gender?: string;
    material?: string;
    q?: string;
  }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const q = params.q?.trim() || '';
  const sort = params.sort as any;
  const gender = params.gender as any;
  const material = params.material?.trim() || '';

  const [productsRes, categories, materials] = await Promise.all([
    getPublicProducts({
      search: q || undefined,
      gender: gender && gender !== 'all' ? gender : undefined,
      material: material && material !== 'all' ? material : undefined,
      sort: sort || 'newest',
      page,
      limit: 24,
    }),
    getPublicCategories(),
    getPublicMaterials(),
  ]);

  return (
    <div className="py-8 sm:py-12 bg-luxury-black min-h-screen">
      <Container size="xl">
        <Suspense fallback={<div className="h-96 w-full animate-pulse bg-neutral-900 rounded-md" />}>
          <CatalogBrowser
            initialProducts={productsRes.products}
            categories={categories}
            availableMaterials={materials}
            categoryTitle="All Jewellery Pieces"
            categoryDescription="Explore our curated collection of fashion jewellery and accessories for everyday wear, gifting, and memorable occasions."
            currentPage={productsRes.page}
            totalPages={productsRes.totalPages}
            totalProducts={productsRes.total}
            initialSearchQuery={q}
            baseUrl="/shop"
          />
        </Suspense>
      </Container>
    </div>
  );
}

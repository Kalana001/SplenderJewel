import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPublicProducts, getPublicMaterials } from '@/lib/catalog/public';
import { getPublicCategories } from '@/lib/catalog/categories';
import { CatalogBrowser } from '@/components/store/catalog-browser';
import { Container } from '@/components/ui/container';

export const metadata: Metadata = {
  title: 'Search Jewelry',
  description: 'Search fine jewelry by name, material, or style across the Splender Jewel catalog.',
  robots: {
    index: false,
    follow: true,
  },
};

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    gender?: string;
    material?: string;
    category?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const searchTerm = params.q?.trim() || '';
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const sort = params.sort as any;
  const gender = params.gender as any;
  const material = params.material?.trim() || '';
  const categorySlug = params.category?.trim() || '';

  const [productsRes, categories, materials] = await Promise.all([
    getPublicProducts({
      search: searchTerm,
      categorySlug: categorySlug && categorySlug !== 'all' ? categorySlug : undefined,
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
            currentCategorySlug={categorySlug || undefined}
            categoryTitle={searchTerm ? `Search Results for "${searchTerm}"` : 'Search Jewelry'}
            categoryDescription={
              searchTerm
                ? `Found ${productsRes.total} piece${productsRes.total === 1 ? '' : 's'} matching your search.`
                : 'Type a jewelry name, stone type, or material to browse our collection.'
            }
            currentPage={productsRes.page}
            totalPages={productsRes.totalPages}
            totalProducts={productsRes.total}
            initialSearchQuery={searchTerm}
            baseUrl="/search"
          />
        </Suspense>
      </Container>
    </div>
  );
}

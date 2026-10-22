import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPublicProducts, getPublicMaterials, getPublicCategories } from '@/lib/catalog/public';
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
    minPrice?: string;
    maxPrice?: string;
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
  const minPrice = params.minPrice ? Number(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;

  const [productsRes, categories, materials] = await Promise.all([
    getPublicProducts({
      search: searchTerm,
      categorySlug: categorySlug && categorySlug !== 'all' ? categorySlug : undefined,
      gender: gender && gender !== 'all' ? gender : undefined,
      material: material && material !== 'all' ? material : undefined,
      minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
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
              productsRes.isOverflow
                ? 'The search matched too many items to apply exact price filtering. Please narrow your price range or search terms.'
                : searchTerm
                ? `Found ${productsRes.total} piece${productsRes.total === 1 ? '' : 's'} matching your search.`
                : 'Type a jewelry name, stone type, or material to browse our collection.'
            }
            currentPage={productsRes.page}
            totalPages={productsRes.totalPages}
            totalProducts={productsRes.total}
            initialSearchQuery={searchTerm}
            baseUrl="/search"
            isOverflow={productsRes.isOverflow}
          />
        </Suspense>
      </Container>
    </div>
  );
}

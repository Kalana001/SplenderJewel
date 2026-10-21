import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicCategoryBySlug, getPublicProducts, getPublicMaterials } from '@/lib/catalog/public';
import { getPublicCategories } from '@/lib/catalog/categories';
import { CatalogBrowser } from '@/components/store/catalog-browser';
import { Container } from '@/components/ui/container';

export const revalidate = 300;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    page?: string;
    sort?: string;
    gender?: string;
    material?: string;
    q?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let category: Awaited<ReturnType<typeof getPublicCategoryBySlug>> = null;
  try {
    category = await getPublicCategoryBySlug(slug);
  } catch (err) {
    console.error(`[generateMetadata] Error fetching category for slug "${slug}":`, err);
  }

  if (!category) {
    return {
      title: 'Category Not Found',
    };
  }

  return {
    title: `${category.name} Collection`,
    description: category.description || `Browse curated ${category.name} in Sri Lanka. Fine fashion jewelry by Splender Jewel.`,
    alternates: {
      canonical: `/category/${category.slug}`,
    },
    openGraph: {
      title: `${category.name} Collection | Splender Jewel`,
      description: category.description || `Explore ${category.name} fine jewelry collection.`,
      images: category.imageUrl ? [category.imageUrl] : ['/images/logo.png'],
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const sParams = await searchParams;
  const page = Math.max(1, parseInt(sParams.page || '1', 10) || 1);
  const q = sParams.q?.trim() || '';
  const sort = sParams.sort as any;
  const gender = sParams.gender as any;
  const material = sParams.material?.trim() || '';
  const minPrice = sParams.minPrice ? Number(sParams.minPrice) : undefined;
  const maxPrice = sParams.maxPrice ? Number(sParams.maxPrice) : undefined;

  const [category, categories, materials, productsRes] = await Promise.all([
    getPublicCategoryBySlug(slug),
    getPublicCategories(),
    getPublicMaterials(),
    getPublicProducts({
      categorySlug: slug,
      search: q || undefined,
      gender: gender && gender !== 'all' ? gender : undefined,
      material: material && material !== 'all' ? material : undefined,
      minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
      sort: sort || 'newest',
      page,
      limit: 24,
    }),
  ]);

  if (!category) {
    notFound();
  }

  return (
    <div className="py-8 sm:py-12 bg-luxury-black min-h-screen">
      <Container size="xl">
        <Suspense fallback={<div className="h-96 w-full animate-pulse bg-neutral-900 rounded-md" />}>
          <CatalogBrowser
            initialProducts={productsRes.products}
            categories={categories}
            availableMaterials={materials}
            currentCategorySlug={slug}
            categoryTitle={`${category.name} Collection`}
            categoryDescription={category.description}
            currentPage={productsRes.page}
            totalPages={productsRes.totalPages}
            totalProducts={productsRes.total}
            initialSearchQuery={q}
            baseUrl={`/category/${slug}`}
            isOverflow={productsRes.isOverflow}
          />
        </Suspense>
      </Container>
    </div>
  );
}

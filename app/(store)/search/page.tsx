import type { Metadata } from 'next';
import { getPublicProducts } from '@/lib/catalog/public';
import { getPublicCategories } from '@/lib/catalog/categories';
import { CatalogBrowser } from '@/components/store/catalog-browser';
import { Container } from '@/components/ui/container';

export const metadata: Metadata = {
  title: 'Search Jewelry | Splender Jewel',
  description: 'Search fine jewelry by name, material, or style across the Splender Jewel catalog.',
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const searchTerm = q?.trim() || '';

  const [productsRes, categories] = await Promise.all([
    getPublicProducts({ search: searchTerm, limit: 48 }),
    getPublicCategories(),
  ]);

  return (
    <div className="py-8 sm:py-12 bg-luxury-black min-h-screen">
      <Container size="xl">
        <CatalogBrowser
          initialProducts={productsRes.products}
          categories={categories}
          categoryTitle={searchTerm ? `Search Results for "${searchTerm}"` : 'Search Jewelry'}
          categoryDescription={
            searchTerm
              ? `Found ${productsRes.products.length} piece(s) matching your search.`
              : 'Type a jewelry name, stone type, or material to browse our collection.'
          }
        />
      </Container>
    </div>
  );
}

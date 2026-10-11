import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicCategoryBySlug, getPublicProducts } from '@/lib/catalog/public';
import { getPublicCategories } from '@/lib/catalog/categories';
import { CatalogBrowser } from '@/components/store/catalog-browser';
import { Container } from '@/components/ui/container';

export const revalidate = 300;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  let category: Awaited<ReturnType<typeof getPublicCategoryBySlug>> = null;
  try {
    category = await getPublicCategoryBySlug(slug);
  } catch (err) {
    console.error(`[generateMetadata] Error fetching category for slug "${slug}":`, err);
  }

  if (!category) {
    return {
      title: 'Category Not Found | Splender — The Jewel Gallery',
    };
  }

  return {
    title: `${category.name} Collection | Splender — The Jewel Gallery`,
    description: category.description || `Browse curated ${category.name} in Sri Lanka. Fine fashion jewelry by Splender — The Jewel Gallery.`,
    alternates: {
      canonical: `/category/${category.slug}`,
    },
    openGraph: {
      title: `${category.name} | Splender — The Jewel Gallery`,
      description: category.description || `Explore ${category.name} fine jewelry collection.`,
      images: category.imageUrl ? [category.imageUrl] : ['/images/logo.png'],
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;

  const [category, categories, productsRes] = await Promise.all([
    getPublicCategoryBySlug(slug),
    getPublicCategories(),
    getPublicProducts({ categorySlug: slug, limit: 48 }),
  ]);

  if (!category) {
    notFound();
  }

  return (
    <div className="py-8 sm:py-12 bg-luxury-black min-h-screen">
      <Container size="xl">
        <CatalogBrowser
          initialProducts={productsRes.products}
          categories={categories}
          currentCategorySlug={slug}
          categoryTitle={`${category.name} Collection`}
          categoryDescription={category.description}
        />
      </Container>
    </div>
  );
}

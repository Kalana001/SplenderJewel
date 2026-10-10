import { getPublicProducts } from '@/lib/catalog/public';
import { getPublicCategories } from '@/lib/catalog/categories';
import { CatalogBrowser } from '@/components/store/catalog-browser';
import { Container } from '@/components/ui/container';

export const metadata = {
  title: 'Jewelry Catalog | Splender Jewel',
  description: 'Explore the full fine fashion jewelry collection by Splender Jewel. 18K gold-plated rings, necklaces, bracelets, and earrings.',
};

export default async function ShopPage() {
  const [productsRes, categories] = await Promise.all([
    getPublicProducts({ limit: 48 }),
    getPublicCategories(),
  ]);

  return (
    <div className="py-8 sm:py-12 bg-luxury-black min-h-screen">
      <Container size="xl">
        <CatalogBrowser
          initialProducts={productsRes.products}
          categories={categories}
          categoryTitle="All Jewelry Pieces"
          categoryDescription="Explore our curated collection of fine fashion jewelry. Handcrafted with gold plating, premium pearls, and natural gemstones."
        />
      </Container>
    </div>
  );
}

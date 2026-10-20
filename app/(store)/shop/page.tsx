import { getPublicProducts } from '@/lib/catalog/public';
import { getPublicCategories } from '@/lib/catalog/categories';
import { CatalogBrowser } from '@/components/store/catalog-browser';
import { Container } from '@/components/ui/container';

export const revalidate = 300;

export const metadata = {
  title: 'Jewellery Catalog',
  description: 'Explore the full fashion jewellery collection by Splender Jewel. Rings, necklaces, bracelets, and earrings with Islandwide Delivery.',
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
          categoryTitle="All Jewellery Pieces"
          categoryDescription="Explore our curated collection of fashion jewellery and accessories for everyday wear, gifting, and memorable occasions."
        />
      </Container>
    </div>
  );
}

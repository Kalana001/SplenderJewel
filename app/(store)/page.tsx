import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Sparkles, Shield, Truck, ArrowRight } from 'lucide-react';
import { getInstagramLink, DEFAULT_STORE_CATEGORIES } from '@/lib/config/store';
import { InstagramIcon } from '@/components/icons/instagram';
import { getPublicCategories, getPublicProducts } from '@/lib/catalog/public';
import { getPublicBanners, getPublicHomepageSections } from '@/lib/cms/public';
import { HeroBanner } from '@/components/store/hero-banner';
import { ProductCard } from '@/components/store/product-card';
import type { Category, ProductPublic } from '@/types/product';
import type { Banner, HomepageSection } from '@/types/cms';

export const revalidate = 60;

export default async function HomePage() {
  // Parallel retrieval of storefront banners, CMS sections, categories, and signature products
  const [banners, sections, categories, featuredResult] = await Promise.all([
    getPublicBanners().catch((err) => {
      console.error('[HomePage] Database error loading banners:', err);
      return [] as Banner[];
    }),
    getPublicHomepageSections().catch((err) => {
      console.error('[HomePage] Database error loading homepage sections:', err);
      return [] as HomepageSection[];
    }),
    getPublicCategories().catch((err) => {
      console.error('[HomePage] Database error loading categories, falling back to default categories:', err);
      return DEFAULT_STORE_CATEGORIES as Category[];
    }),
    getPublicProducts({ sort: 'featured', limit: 8 }).catch((err) => {
      console.error('[HomePage] Database error loading featured products:', err);
      return { products: [] as ProductPublic[], total: 0, page: 1, limit: 8, totalPages: 0 };
    }),
  ]);

  // Section index mapping for quick lookup
  const sectionsMap = new Map<string, HomepageSection>();
  sections.forEach((s) => sectionsMap.set(s.sectionKey, s));

  const heroSection = sectionsMap.get('hero');
  const pillarsSection = sectionsMap.get('pillars');
  const categorySection = sectionsMap.get('categories');
  const featuredSection = sectionsMap.get('featured_products');

  // Categories display limit logic
  const rawDisplayCount = categorySection?.configData?.displayCount;
  const explicitLimit =
    typeof rawDisplayCount === 'number' && rawDisplayCount > 0
      ? rawDisplayCount
      : typeof rawDisplayCount === 'string' && Number(rawDisplayCount) > 0
      ? Number(rawDisplayCount)
      : null;

  const visibleCategories = explicitLimit ? categories.slice(0, explicitLimit) : categories;
  const categoryTitle = categorySection?.title?.trim() || 'Curated Collections';
  const categorySubtitle = categorySection?.subtitle?.trim() || 'Browse by Category';

  // Featured products limit
  const maxFeaturedItems =
    typeof featuredSection?.configData?.maxItems === 'number' && featuredSection.configData.maxItems > 0
      ? featuredSection.configData.maxItems
      : 8;
  const visibleFeaturedProducts = featuredResult.products.slice(0, maxFeaturedItems);
  const featuredTitle = featuredSection?.title?.trim() || 'Signature & Trending Pieces';
  const featuredSubtitle = featuredSection?.subtitle?.trim() || 'Hand-selected by our master jewelers';

  // Section order determination: sort active enabled sections by displayOrder
  // If sections array is empty (database offline), fallback order is hero -> pillars -> categories -> featured_products
  const sortedSectionKeys =
    sections.length > 0
      ? sections.filter((s) => s.isEnabled).map((s) => s.sectionKey)
      : ['hero', 'pillars', 'categories', 'featured_products'];

  return (
    <div className="space-y-12 sm:space-y-16 md:space-y-20 pb-16 sm:pb-20">
      {sortedSectionKeys.map((sectionKey) => {
        switch (sectionKey) {
          case 'hero':
            return (
              <HeroBanner
                key="hero"
                banners={banners}
                heroSection={heroSection}
              />
            );

          case 'pillars':
            return (
              <section key="pillars" aria-label="Brand Distinction">
                <Container size="xl">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                    <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-neutral-750 transition-colors flex items-start space-x-4">
                      <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">
                          Curated Fashion Jewellery
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Carefully selected fashion jewellery and accessories designed for everyday wear and special occasions.
                        </p>
                      </div>
                    </div>

                    <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-neutral-750 transition-colors flex items-start space-x-4">
                      <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">
                          Islandwide Delivery
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Safe, dependable delivery across Sri Lanka through Sri Lanka Post services.
                        </p>
                      </div>
                    </div>

                    <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-neutral-750 transition-colors flex items-start space-x-4">
                      <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                        <Shield className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">
                          Personal Customer Care
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Cash on Delivery (COD) and direct Bank Transfer payment options.
                        </p>
                      </div>
                    </div>
                  </div>
                </Container>
              </section>
            );

          case 'categories':
            if (visibleCategories.length === 0) return null;
            return (
              <section key="categories" aria-label="Collections by Category">
                <Container size="xl">
                  <div className="text-center mb-8 sm:mb-10">
                    <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-luxury-gold font-semibold">
                      {categorySubtitle}
                    </span>
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1 uppercase tracking-wide">
                      {categoryTitle}
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                    {visibleCategories.map((cat) => (
                      <Link
                        key={cat.id || cat.slug}
                        href={`/category/${cat.slug}`}
                        className="group relative block p-4 sm:p-6 rounded-sm border border-neutral-850 bg-neutral-900/30 hover:border-luxury-gold/40 hover:bg-neutral-900/60 transition-all text-center overflow-hidden"
                      >
                        {cat.imageUrl ? (
                          <div className="relative w-full h-28 sm:h-36 md:h-44 mb-3.5 rounded-sm overflow-hidden bg-neutral-950 border border-neutral-850/80 group-hover:border-luxury-gold/30 transition-all">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={cat.imageUrl}
                              alt={cat.name}
                              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="h-10 w-10 mx-auto mb-3.5 rounded-full bg-neutral-800/80 border border-neutral-750 flex items-center justify-center text-luxury-gold group-hover:scale-105 group-hover:border-luxury-gold/40 transition-all">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        )}
                        <h3 className="font-serif text-xs sm:text-sm md:text-base font-semibold text-white group-hover:text-luxury-gold transition-colors line-clamp-1">
                          {cat.name}
                        </h3>
                        <p className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 line-clamp-1">
                          {cat.description || 'Curated Collection'}
                        </p>
                      </Link>
                    ))}
                  </div>
                </Container>
              </section>
            );

          case 'featured_products':
            if (visibleFeaturedProducts.length === 0) return null;
            return (
              <section key="featured_products" aria-label="Featured Jewelry Pieces">
                <Container size="xl">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-10 gap-4">
                    <div>
                      <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-luxury-gold font-semibold">
                        {featuredSubtitle}
                      </span>
                      <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1 uppercase tracking-wide">
                        {featuredTitle}
                      </h2>
                    </div>

                    <Link href="/shop" className="self-start sm:self-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs uppercase tracking-widest text-luxury-gold hover:text-luxury-gold-light hover:bg-luxury-gold/10 p-0 sm:px-3 h-8 space-x-1"
                      >
                        <span>View All Jewelry</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                    {visibleFeaturedProducts.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </Container>
              </section>
            );

          default:
            return null;
        }
      })}

      {/* Instagram Community Showcase */}
      <section className="border-t border-neutral-850 bg-gradient-to-b from-neutral-950/80 to-black py-12 sm:py-16">
        <Container size="xl" className="text-center">
          <div className="max-w-xl mx-auto space-y-3 sm:space-y-4">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-luxury-gold/10 border border-luxury-gold/25 text-luxury-gold-light text-[10px] sm:text-xs uppercase tracking-[0.25em]">
              <InstagramIcon className="h-3 w-3 text-luxury-gold" />
              <span>@splender_jewel</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white uppercase tracking-wide">
              Follow Our Journey
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed font-light">
              Join our Instagram gallery for daily jewelry inspirations, new arrival drops, styling ideas, and behind-the-scenes craft.
            </p>
            <div className="pt-2">
              <a
                href={getInstagramLink()}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="outline"
                  size="md"
                  className="h-11 px-6 text-xs uppercase tracking-[0.18em] border-luxury-gold/40 text-luxury-gold hover:bg-luxury-gold/10 hover:border-luxury-gold space-x-2 shadow-md shadow-black"
                >
                  <InstagramIcon className="h-4 w-4" />
                  <span>Follow @splender_jewel on Instagram</span>
                </Button>
              </a>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}

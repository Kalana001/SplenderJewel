import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Sparkles, Shield, Truck, ArrowRight, MessageCircle, Star } from 'lucide-react';
import { getInstagramLink, getWhatsAppLink, getStoreConfig, DEFAULT_STORE_CATEGORIES } from '@/lib/config/store';
import { InstagramIcon } from '@/components/icons/instagram';
import { getPublicCategories, getPublicProducts } from '@/lib/catalog/public';
import { getPublicBanners, getPublicHomepageSections } from '@/lib/cms/public';
import { getPublicApprovedReviews } from '@/lib/reviews/public';
import { getCanonicalSiteUrl } from '@/lib/auth/redirect';
import { HeroBanner } from '@/components/store/hero-banner';
import { ProductCard } from '@/components/store/product-card';
import { EditorialCollage } from '@/components/store/editorial-collage';
import {
  buildCollageItems,
  resolveHeroData,
  resolveVisibleCategories,
  resolveVisibleFeaturedProducts,
} from '@/lib/cms/homepage-view';
import type { Category, ProductPublic } from '@/types/product';
import type { Banner, HomepageSection } from '@/types/cms';

export const revalidate = 60;

export default async function HomePage() {
  const storeConfig = getStoreConfig();

  // Parallel retrieval of storefront banners, CMS sections, categories, signature products, and genuine reviews
  const [banners, sections, categories, featuredResult, approvedReviews] = await Promise.all([
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
    getPublicApprovedReviews(6).catch((err) => {
      console.error('[HomePage] Database error loading approved reviews:', err);
      return [];
    }),
  ]);

  // Section index mapping for quick lookup
  const sectionsMap = new Map<string, HomepageSection>();
  sections.forEach((s) => sectionsMap.set(s.sectionKey, s));

  const heroSection = sectionsMap.get('hero');
  const collageSection = sectionsMap.get('collage');
  const categorySection = sectionsMap.get('categories');
  const featuredSection = sectionsMap.get('featured_products');
  const pillarsSection = sectionsMap.get('pillars');
  const reviewsSection = sectionsMap.get('reviews');

  const collageItems = buildCollageItems(featuredResult.products, categories);
  const { visibleCategories, title: categoryTitle, subtitle: categorySubtitle } =
    resolveVisibleCategories(categories, categorySection);
  const isCategoriesAvailable =
    (categorySection ? categorySection.isEnabled : true) && visibleCategories.length > 0;

  // Pure logic helpers for section resolution & real image sourcing
  const heroData = resolveHeroData(
    banners,
    heroSection,
    featuredResult.products,
    categories,
    storeConfig.whatsAppNumber,
    categorySection,
    isCategoriesAvailable
  );
  const { visibleProducts: visibleFeaturedProducts, title: featuredTitle, subtitle: featuredSubtitle } =
    resolveVisibleFeaturedProducts(featuredResult.products, featuredSection);

  // Section order determination: sort active enabled sections by displayOrder
  // Ensure no duplicate section keys using Set
  const sortedSectionKeys =
    sections.length > 0
      ? Array.from(new Set(sections.filter((s) => s.isEnabled).map((s) => s.sectionKey)))
      : ['hero', 'collage', 'categories', 'featured_products', 'pillars'];

  // Resolve safe WhatsApp link from configured store setting
  const whatsAppInquiryUrl = getWhatsAppLink(
    'Hello Splender Jewel, I would like to inquire about your jewellery collection and ordering.',
    storeConfig
  );

  const siteUrl = getCanonicalSiteUrl();
  const homepageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JewelryStore',
    name: 'Splender Jewel',
    description:
      'Fine fashion jewellery and accessories based in Negombo, Sri Lanka. Elegance, modern trends, and timeless style with islandwide delivery.',
    url: siteUrl,
    logo: `${siteUrl}/images/logo.png`,
    telephone: storeConfig.whatsAppNumber || '+94764689907',
    sameAs: ['https://www.instagram.com/splender_jewel/'],
    priceRange: 'LKR',
    currenciesAccepted: 'LKR',
    paymentAccepted: 'Cash on Delivery, Bank Transfer',
    areaServed: {
      '@type': 'Country',
      name: 'Sri Lanka',
    },
  };

  return (
    <div className="space-y-12 sm:space-y-16 md:space-y-20 pb-16 sm:pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd).replace(/</g, '\\u003c') }}
      />
      {sortedSectionKeys.map((sectionKey) => {
        switch (sectionKey) {
          case 'hero':
            return (
              <HeroBanner
                key="hero"
                banners={banners}
                heroSection={heroSection}
                featuredImageUrl={heroData.featuredImageUrl}
                whatsAppNumber={storeConfig.whatsAppNumber}
                categoriesAvailable={isCategoriesAvailable}
              />
            );

          case 'collage':
            return (
              <EditorialCollage
                key="collage"
                section={collageSection}
                items={collageItems}
              />
            );

          case 'categories':
            if (visibleCategories.length === 0) return null;
            return (
              <section
                key="categories"
                id="categories"
                className="scroll-mt-20 sm:scroll-mt-24 lg:scroll-mt-28"
                aria-label="Collections by Category"
              >
                <Container size="xl">
                  <div className="text-center mb-8 sm:mb-10">
                    <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-luxury-gold font-semibold">
                      {categorySubtitle}
                    </span>
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1 uppercase tracking-wide">
                      {categoryTitle}
                    </h2>
                  </div>

                  {/* Curated Category Grid: 2-col mobile, 3-col tablet, 6-col desktop */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                    {visibleCategories.map((cat) => (
                      <Link
                        key={cat.id || cat.slug}
                        href={`/category/${cat.slug}`}
                        className="group relative block rounded-sm border border-neutral-850 bg-neutral-900/30 hover:border-luxury-gold/50 transition-all duration-300 overflow-hidden"
                      >
                        <div className="relative w-full aspect-[4/5] bg-neutral-950 overflow-hidden">
                          {cat.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cat.imageUrl}
                              alt={cat.name}
                              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-neutral-900 to-neutral-950 text-luxury-gold">
                              <div className="h-10 w-10 rounded-full bg-neutral-800/80 border border-neutral-750 flex items-center justify-center group-hover:scale-110 group-hover:border-luxury-gold/50 transition-all">
                                <Sparkles className="h-4 w-4" />
                              </div>
                            </div>
                          )}

                          {/* Subtle gradient vignette for text legibility */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                          {/* Category label overlay */}
                          <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 text-center">
                            <h3 className="font-serif text-xs sm:text-sm font-semibold text-white group-hover:text-luxury-gold transition-colors line-clamp-1">
                              {cat.name}
                            </h3>
                            <p className="text-[10px] text-neutral-400 mt-0.5 line-clamp-1 font-light">
                              {cat.description || 'Curated Collection'}
                            </p>
                          </div>
                        </div>
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

          case 'pillars':
            return (
              <section key="pillars" aria-label="Brand Distinction">
                <Container size="xl">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                    <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-luxury-gold/30 transition-colors flex items-start space-x-4">
                      <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">
                          Curated Fashion Jewellery
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Carefully selected fashion jewellery and accessories designed for everyday wear, gifting, and special celebrations.
                        </p>
                      </div>
                    </div>

                    <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-luxury-gold/30 transition-colors flex items-start space-x-4">
                      <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">
                          Islandwide Delivery
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Safe, dependable delivery across Sri Lanka via Sri Lanka Post. Delivery typically takes 24–48 working hours after dispatch.
                        </p>
                      </div>
                    </div>

                    <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-luxury-gold/30 transition-colors flex items-start space-x-4">
                      <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                        <Shield className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">
                          Personal Customer Care
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Cash on Delivery (COD) via Sri Lanka Post COD, and Bank Transfer with Sri Lanka Post Speed Post after payment verification.
                        </p>
                      </div>
                    </div>
                  </div>
                </Container>
              </section>
            );

          case 'reviews':
            // Only render genuine administrator-approved customer reviews from the database
            // Gracefully hide the section if no approved reviews are available
            if (!approvedReviews || approvedReviews.length === 0) {
              return null;
            }
            return (
              <section key="reviews" aria-label="Patron Testimonials" className="py-6 sm:py-8">
                <Container size="xl">
                  <div className="text-center mb-8 sm:mb-10">
                    <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-luxury-gold font-semibold">
                      {reviewsSection?.subtitle?.trim() || 'Patron Testimonials'}
                    </span>
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1 uppercase tracking-wide">
                      {reviewsSection?.title?.trim() || 'What Our Patrons Say'}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                    {approvedReviews.slice(0, 3).map((review) => (
                      <div
                        key={review.id}
                        className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-luxury-gold/30 transition-colors flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex space-x-1 text-luxury-gold">
                            {[...Array(review.rating)].map((_, i) => (
                              <Star key={i} className="h-4 w-4 fill-luxury-gold" />
                            ))}
                          </div>
                          {review.title && (
                            <h4 className="font-serif text-sm font-semibold text-white">
                              {review.title}
                            </h4>
                          )}
                          <p className="font-serif text-sm text-neutral-300 italic leading-relaxed">
                            &ldquo;{review.comment}&rdquo;
                          </p>
                        </div>
                        <div className="pt-4 mt-4 border-t border-neutral-800">
                          <p className="text-xs font-semibold text-white">{review.customerName}</p>
                          {review.productName && (
                            <p className="text-[11px] text-neutral-400">{review.productName}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Container>
              </section>
            );

          default:
            return null;
        }
      })}

      {/* VIP WhatsApp Concierge CTA Banner */}
      <section aria-label="WhatsApp Concierge" className="py-4">
        <Container size="xl">
          <div className="relative rounded-sm border border-luxury-gold/30 bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 p-6 sm:p-10 md:p-12 overflow-hidden shadow-xl">
            <div className="relative z-10 max-w-2xl space-y-4">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold text-[10px] sm:text-xs uppercase tracking-[0.25em]">
                <MessageCircle className="h-3.5 w-3.5" />
                <span>Personal Concierge</span>
              </div>
              <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-wide">
                Bespoke Guidance & WhatsApp Ordering
              </h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-light">
                Looking for styling recommendations, custom gift packaging, or immediate assistance? Connect directly with our jewellery specialists in Negombo via WhatsApp for personal care and effortless ordering.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {whatsAppInquiryUrl ? (
                  <a
                    href={whatsAppInquiryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      size="md"
                      className="h-11 px-6 text-xs uppercase tracking-[0.18em] bg-luxury-gold hover:bg-luxury-gold-light text-black font-semibold space-x-2 shadow-lg shadow-black"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Inquire via WhatsApp</span>
                    </Button>
                  </a>
                ) : null}
                <Link href="/shop">
                  <Button
                    variant="outline"
                    size="md"
                    className="h-11 px-6 text-xs uppercase tracking-[0.18em] border-neutral-700 text-neutral-200 hover:border-luxury-gold hover:text-luxury-gold"
                  >
                    <span>Explore Full Catalog</span>
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-3 text-[11px] text-neutral-400">
                <span className="flex items-center space-x-1.5">
                  <Truck className="h-3.5 w-3.5 text-luxury-gold" />
                  <span>Islandwide Delivery via Sri Lanka Post</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <Shield className="h-3.5 w-3.5 text-luxury-gold" />
                  <span>Cash on Delivery (COD) & Bank Transfer</span>
                </span>
              </div>
            </div>
          </div>
        </Container>
      </section>

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
              Follow our official Instagram gallery @splender_jewel for jewellery inspirations, new arrivals, styling previews, and brand updates.
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

import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Sparkles, Shield, Truck, MessageCircle } from 'lucide-react';
import { getWhatsAppLink, getInstagramLink } from '@/lib/config/store';
import { InstagramIcon } from '@/components/icons/instagram';
import { getPublicCategories } from '@/lib/catalog/public';
import { getPublicHomepageSection } from '@/lib/cms/public';
import { DEFAULT_STORE_CATEGORIES } from '@/lib/config/store';
import type { Category } from '@/types/product';

export const revalidate = 60;

export default async function HomePage() {
  const [categories, cmsCategorySection] = await Promise.all([
    getPublicCategories().catch((err) => {
      console.error('[HomePage] Database error loading categories, falling back to default categories:', err);
      return DEFAULT_STORE_CATEGORIES;
    }),
    getPublicHomepageSection('categories').catch((err) => {
      console.error('[HomePage] Database error loading categories CMS section:', err);
      return null;
    }),
  ]);

  const showCategoriesSection = cmsCategorySection ? cmsCategorySection.isEnabled : true;
  
  // Explicit CMS display limit:
  // If an administrator explicitly configures a numeric display limit > 0, respect it.
  // If no explicit limit is configured in CMS, show ALL active categories instead of defaulting to six.
  const rawDisplayCount = cmsCategorySection?.configData?.displayCount;
  const explicitLimit =
    typeof rawDisplayCount === 'number' && rawDisplayCount > 0
      ? rawDisplayCount
      : typeof rawDisplayCount === 'string' && Number(rawDisplayCount) > 0
      ? Number(rawDisplayCount)
      : null;

  const visibleCategories = explicitLimit ? categories.slice(0, explicitLimit) : categories;
  const sectionTitle = cmsCategorySection?.title?.trim() || 'Jewelry by Category';
  const sectionSubtitle = cmsCategorySection?.subtitle?.trim() || 'Browse Collections';

  return (
    <div className="space-y-12 sm:space-y-16 md:space-y-20 pb-16 sm:pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-neutral-950 via-luxury-black to-neutral-950 py-12 sm:py-16 md:py-20 border-b border-neutral-850">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.05),_transparent_70%)] pointer-events-none" />

        <Container size="xl" className="relative text-center">
          {/* Subtle brand kicker */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-900/80 border border-luxury-gold/30 text-luxury-gold text-[10px] sm:text-xs uppercase tracking-[0.25em] mb-4 sm:mb-6">
            <Sparkles className="h-3 w-3 text-luxury-gold" />
            <span>The Jewel Gallery — Sri Lanka</span>
          </div>

          {/* Headline */}
          <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl font-bold tracking-[0.05em] text-white uppercase max-w-4xl mx-auto leading-tight">
            Timeless Elegance <br />
            <span className="text-luxury-gold font-serif font-light italic tracking-wide text-2xl sm:text-4xl md:text-5xl capitalize">
              Refined Luxury
            </span>
          </h1>

          {/* Description */}
          <p className="mt-4 sm:mt-6 text-xs sm:text-sm md:text-base text-neutral-300 max-w-2xl mx-auto leading-relaxed font-light">
            Discover exquisite fashion jewelry crafted for everyday distinction and special occasions.
            Gold-plated designs, tiger eye, pearl jewelry, and bespoke modern accents for women and men.
          </p>

          {/* Actions: Consistent heights, typography, clear hierarchy, no magenta */}
          <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link href="/shop" className="w-full sm:w-auto">
              <Button
                variant="gold"
                size="md"
                className="w-full sm:w-auto min-w-[160px] sm:min-w-[175px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-semibold shadow-md shadow-luxury-gold/10"
              >
                Explore Catalog
              </Button>
            </Link>

            <Link href="/category/rings" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="md"
                className="w-full sm:w-auto min-w-[160px] sm:min-w-[175px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-medium bg-neutral-900/90 hover:bg-neutral-850 text-neutral-200 hover:text-white border border-neutral-700 hover:border-luxury-gold/50"
              >
                Featured Rings
              </Button>
            </Link>

            <a
              href={getWhatsAppLink('Hello Splender Jewel, I would like to enquire about your jewelry.')}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <Button
                variant="outline"
                size="md"
                className="w-full sm:w-auto min-w-[160px] sm:min-w-[175px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-medium space-x-2 border-neutral-800 hover:border-luxury-gold/50 text-neutral-300 hover:text-luxury-gold"
              >
                <MessageCircle className="h-4 w-4 text-luxury-gold" />
                <span>WhatsApp Care</span>
              </Button>
            </a>
          </div>
        </Container>
      </section>

      {/* Feature Pillars */}
      <section>
        <Container size="xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-neutral-750 transition-colors flex items-start space-x-4">
              <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">Curated Luxury</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Carefully selected gold-plated, tiger eye, and pearl fashion jewelry designed with fine detail.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-neutral-750 transition-colors flex items-start space-x-4">
              <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">Islandwide Home Delivery</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Safe, direct doorstep delivery across all 25 administrative districts of Sri Lanka.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-sm border border-neutral-850 bg-neutral-900/40 hover:border-neutral-750 transition-colors flex items-start space-x-4">
              <div className="p-2.5 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20 shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif text-sm sm:text-base font-semibold text-white tracking-wide">Personal Customer Care</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Convenient Cash on Delivery and direct WhatsApp Bank Transfer support.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Categories Grid */}
      {showCategoriesSection && visibleCategories.length > 0 && (
        <section>
          <Container size="xl">
            <div className="text-center mb-8 sm:mb-10">
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-luxury-gold font-semibold">
                {sectionSubtitle}
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1 uppercase tracking-wide">
                {sectionTitle}
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
      )}

      {/* Instagram Community Section */}
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

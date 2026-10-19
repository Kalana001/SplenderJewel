'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Sparkles, MessageCircle, ChevronLeft, ChevronRight, ArrowRight, ShieldCheck, Truck } from 'lucide-react';
import { getWhatsAppLink } from '@/lib/config/store';
import type { Banner, HomepageSection } from '@/types/cms';
import { resolveHeroData } from '@/lib/cms/homepage-view';

interface HeroBannerProps {
  banners: Banner[];
  heroSection?: HomepageSection | null;
  featuredImageUrl?: string | null;
  featuredImageAlt?: string;
  whatsAppNumber?: string;
  categoriesAvailable?: boolean;
}

export function HeroBanner({
  banners,
  heroSection,
  featuredImageUrl,
  featuredImageAlt,
  whatsAppNumber,
  categoriesAvailable = true,
}: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const heroData = resolveHeroData(
    banners,
    heroSection,
    undefined,
    undefined,
    whatsAppNumber,
    undefined,
    categoriesAvailable
  );
  const activeBanners = heroData.banners;
  const bannerCount = activeBanners.length;

  // Handle direct hash navigation to #categories on initial page load / after content renders
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#categories') {
      const timer = setTimeout(() => {
        const el = document.getElementById('categories');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSecondaryClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      heroData.secondaryCtaLink === '#categories' ||
      heroData.secondaryCtaLink === '/#categories'
    ) {
      const el = document.getElementById('categories');
      if (el) {
        e.preventDefault();
        if (window.location.hash !== '#categories') {
          window.history.pushState(null, '', '/#categories');
        }
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const nextSlide = useCallback(() => {
    if (bannerCount <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % bannerCount);
  }, [bannerCount]);

  const prevSlide = useCallback(() => {
    if (bannerCount <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + bannerCount) % bannerCount);
  }, [bannerCount]);

  // Auto-advance carousel every 6 seconds when not paused and multiple banners exist
  useEffect(() => {
    if (bannerCount <= 1 || isPaused) return;
    const interval = setInterval(() => {
      nextSlide();
    }, 6000);
    return () => clearInterval(interval);
  }, [bannerCount, isPaused, nextSlide]);

  // ---------------------------------------------------------------------------
  // 1. EDITORIAL 2-COLUMN HERO (Default when NO active banners exist)
  // ---------------------------------------------------------------------------
  if (bannerCount === 0) {
    const heroImage = featuredImageUrl || heroData.featuredImageUrl;
    const heroImageAlt = featuredImageAlt || heroData.featuredImageAlt;

    return (
      <section
        aria-label="Welcome to Splender Jewel"
        className="relative overflow-hidden bg-gradient-to-b from-neutral-950 via-luxury-black to-neutral-950 border-b border-neutral-850 py-10 sm:py-14 lg:py-20"
      >
        {/* Subtle radial luxury glow */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.06),_transparent_70%)] pointer-events-none"
        />

        <Container size="xl" className="relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Column: Brand Content & Action */}
            <div className="lg:col-span-7 space-y-5 sm:space-y-6 text-center lg:text-left">
              {/* Eyebrow badge */}
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-900/90 border border-luxury-gold/30 text-luxury-gold text-[10px] sm:text-xs uppercase tracking-[0.22em] shadow-sm">
                <Sparkles className="h-3 w-3 text-luxury-gold" />
                <span>{heroData.eyebrow}</span>
              </div>

              {/* Headline */}
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold tracking-tight text-white leading-[1.15] max-w-2xl mx-auto lg:mx-0">
                {heroData.headline}
              </h1>

              {/* Description */}
              <p className="text-sm sm:text-base text-neutral-300 max-w-xl mx-auto lg:mx-0 leading-relaxed font-light">
                {heroData.description}
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4">
                <Link href={heroData.primaryCtaLink} className="w-full sm:w-auto">
                  <Button
                    variant="gold"
                    size="md"
                    className="w-full sm:w-auto min-w-[170px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-semibold shadow-md shadow-luxury-gold/15 space-x-2"
                  >
                    <span>{heroData.primaryCtaText}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>

                <Link
                  href={heroData.secondaryCtaLink}
                  onClick={handleSecondaryClick}
                  className="w-full sm:w-auto"
                >
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full sm:w-auto min-w-[160px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-medium bg-neutral-900/90 hover:bg-neutral-850 text-neutral-200 hover:text-white border border-neutral-700 hover:border-luxury-gold/50"
                  >
                    {heroData.secondaryCtaText}
                  </Button>
                </Link>

                {heroData.whatsAppHref && (
                  <a
                    href={heroData.whatsAppHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto"
                  >
                    <Button
                      variant="outline"
                      size="md"
                      className="w-full sm:w-auto min-w-[160px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-medium space-x-2 border-neutral-800 hover:border-luxury-gold/50 text-neutral-300 hover:text-luxury-gold"
                    >
                      <MessageCircle className="h-4 w-4 text-luxury-gold" />
                      <span>WhatsApp Care</span>
                    </Button>
                  </a>
                )}
              </div>

              {/* Micro Trust Indicators */}
              <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-4 sm:gap-6 text-xs text-neutral-400 border-t border-neutral-850/80">
                <div className="flex items-center space-x-1.5">
                  <Truck className="h-3.5 w-3.5 text-luxury-gold" />
                  <span>Islandwide Delivery (Sri Lanka Post)</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-luxury-gold" />
                  <span>Cash on Delivery & Bank Transfer</span>
                </div>
              </div>
            </div>

            {/* Right Column: High-Quality Jewellery Photography Focal Point */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-full max-w-md aspect-[4/5] rounded-sm overflow-hidden bg-neutral-950 border border-neutral-800 shadow-2xl shadow-black/80 group">
                {heroImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={heroImage}
                      alt={heroImageAlt}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                      loading="eager"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                    {/* Subtle floating branding tag */}
                    <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-sm bg-neutral-900/90 border border-luxury-gold/30 backdrop-blur-md flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-luxury-gold font-semibold block">
                          Signature Collection
                        </span>
                        <span className="text-xs font-serif font-medium text-white line-clamp-1">
                          {heroImageAlt}
                        </span>
                      </div>
                      <Link
                        href="/shop"
                        className="text-[11px] uppercase tracking-wider text-luxury-gold hover:text-luxury-gold-light font-semibold shrink-0"
                      >
                        Explore &rarr;
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-black">
                    <div className="h-16 w-16 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold mb-4">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <span className="font-serif text-lg font-bold text-white tracking-widest uppercase">
                      Splender Jewel
                    </span>
                    <span className="text-xs uppercase tracking-[0.25em] text-luxury-gold mt-1">
                      Fashion Jewellery
                    </span>
                    <p className="text-xs text-neutral-400 mt-3 max-w-xs leading-relaxed font-light">
                      Handpicked jewelry and accessories crafted with passion in Sri Lanka.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Container>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. ACTIVE CMS BANNERS SHOWCASE (When administrator configured active banners)
  // ---------------------------------------------------------------------------
  const currentBanner = activeBanners[currentIndex];

  return (
    <section
      className="relative overflow-hidden bg-neutral-950 border-b border-neutral-850"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Promotional Banners"
    >
      <div className="relative min-h-[440px] sm:min-h-[500px] md:min-h-[560px] w-full flex items-center justify-center">
        {/* Banner Images (Desktop and Mobile) */}
        {activeBanners.map((banner, idx) => {
          const isActive = idx === currentIndex;
          const mobileSrc = banner.mobileImageUrl || banner.imageUrl;

          return (
            <div
              key={banner.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
              aria-hidden={!isActive}
            >
              <picture className="w-full h-full block">
                {banner.mobileImageUrl && (
                  <source media="(max-width: 640px)" srcSet={banner.mobileImageUrl} />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={banner.imageUrl || mobileSrc}
                  alt={banner.title}
                  className="w-full h-full object-cover object-center"
                  loading={idx === 0 ? 'eager' : 'lazy'}
                />
              </picture>

              {/* Luxury dark gradient overlay for text legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/35" />
            </div>
          );
        })}

        {/* Banner Text & Action Content */}
        <Container size="xl" className="relative z-20 text-center py-12 sm:py-16 md:py-20">
          {currentBanner.subtitle && (
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-900/80 border border-luxury-gold/40 text-luxury-gold text-[10px] sm:text-xs uppercase tracking-[0.25em] mb-4 sm:mb-6 shadow-sm">
              <Sparkles className="h-3 w-3 text-luxury-gold" />
              <span>{currentBanner.subtitle}</span>
            </div>
          )}

          <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl font-bold tracking-[0.05em] text-white uppercase max-w-4xl mx-auto leading-tight drop-shadow-md">
            {currentBanner.title}
          </h1>

          <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {currentBanner.buttonText && currentBanner.linkUrl ? (
              <Link href={currentBanner.linkUrl} className="w-full sm:w-auto">
                <Button
                  variant="gold"
                  size="md"
                  className="w-full sm:w-auto min-w-[160px] sm:min-w-[175px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-semibold shadow-md shadow-luxury-gold/20"
                >
                  {currentBanner.buttonText}
                </Button>
              </Link>
            ) : (
              <Link href="/shop" className="w-full sm:w-auto">
                <Button
                  variant="gold"
                  size="md"
                  className="w-full sm:w-auto min-w-[160px] sm:min-w-[175px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-semibold shadow-md shadow-luxury-gold/20"
                >
                  Explore Catalog
                </Button>
              </Link>
            )}

            <a
              href={getWhatsAppLink(`Hello Splender Jewel, I'm inquiring about: ${currentBanner.title}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <Button
                variant="outline"
                size="md"
                className="w-full sm:w-auto min-w-[160px] sm:min-w-[175px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-medium space-x-2 bg-black/40 border-neutral-700 hover:border-luxury-gold/50 text-neutral-200 hover:text-luxury-gold backdrop-blur-sm"
              >
                <MessageCircle className="h-4 w-4 text-luxury-gold" />
                <span>WhatsApp Care</span>
              </Button>
            </a>
          </div>
        </Container>

        {/* Carousel Controls (if more than 1 banner) */}
        {bannerCount > 1 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous banner"
              className="absolute left-3 sm:left-6 z-30 p-2 sm:p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white/70 hover:text-luxury-gold border border-white/10 hover:border-luxury-gold/40 transition-colors backdrop-blur-sm"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next banner"
              className="absolute right-3 sm:right-6 z-30 p-2 sm:p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white/70 hover:text-luxury-gold border border-white/10 hover:border-luxury-gold/40 transition-colors backdrop-blur-sm"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Pagination Dots */}
            <div className="absolute bottom-4 z-30 flex items-center justify-center space-x-2">
              {activeBanners.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Go to banner ${idx + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? 'w-6 bg-luxury-gold'
                      : 'w-2 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

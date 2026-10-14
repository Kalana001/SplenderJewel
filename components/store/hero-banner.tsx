'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Sparkles, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { getWhatsAppLink } from '@/lib/config/store';
import type { Banner, HomepageSection } from '@/types/cms';

interface HeroBannerProps {
  banners: Banner[];
  heroSection?: HomepageSection | null;
}

export function HeroBanner({ banners, heroSection }: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const bannerCount = banners.length;

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

  // 1. If NO active banners exist, render the refined default hero with CMS text
  if (banners.length === 0) {
    const title = heroSection?.title?.trim() || 'Timeless Elegance';
    const subtitle = heroSection?.subtitle?.trim() || 'The Jewel Gallery — Sri Lanka';
    const ctaText = (heroSection?.configData?.ctaText as string)?.trim() || 'Explore Catalog';
    const ctaLink = (heroSection?.configData?.ctaLink as string)?.trim() || '/shop';

    return (
      <section className="relative overflow-hidden bg-gradient-to-b from-neutral-950 via-luxury-black to-neutral-950 py-12 sm:py-16 md:py-20 border-b border-neutral-850">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.05),_transparent_70%)] pointer-events-none" />

        <Container size="xl" className="relative text-center">
          {/* Subtle brand kicker */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-900/80 border border-luxury-gold/30 text-luxury-gold text-[10px] sm:text-xs uppercase tracking-[0.25em] mb-4 sm:mb-6">
            <Sparkles className="h-3 w-3 text-luxury-gold" />
            <span>{subtitle}</span>
          </div>

          {/* Headline */}
          <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl font-bold tracking-[0.05em] text-white uppercase max-w-4xl mx-auto leading-tight">
            {title} <br />
            <span className="text-luxury-gold font-serif font-light italic tracking-wide text-2xl sm:text-4xl md:text-5xl capitalize">
              Refined Luxury
            </span>
          </h1>

          <p className="mt-4 sm:mt-6 text-xs sm:text-sm md:text-base text-neutral-300 max-w-2xl mx-auto leading-relaxed font-light">
            Discover beautiful fashion jewellery and accessories bringing together elegance, modern trends, and timeless style for everyday wear and memorable occasions.
          </p>

          {/* Actions */}
          <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link href={ctaLink} className="w-full sm:w-auto">
              <Button
                variant="gold"
                size="md"
                className="w-full sm:w-auto min-w-[160px] sm:min-w-[175px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-semibold shadow-md shadow-luxury-gold/10"
              >
                {ctaText}
              </Button>
            </Link>

            <Link href="/shop" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="md"
                className="w-full sm:w-auto min-w-[160px] sm:min-w-[175px] h-11 px-6 text-xs uppercase tracking-[0.18em] font-medium bg-neutral-900/90 hover:bg-neutral-850 text-neutral-200 hover:text-white border border-neutral-700 hover:border-luxury-gold/50"
              >
                Featured Pieces
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
    );
  }

  // 2. Render Active CMS Banners Showcase
  const currentBanner = banners[currentIndex];

  return (
    <section
      className="relative overflow-hidden bg-neutral-950 border-b border-neutral-850"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Promotional Banners"
    >
      <div className="relative min-h-[420px] sm:min-h-[500px] md:min-h-[580px] w-full flex items-center justify-center">
        {/* Banner Images (Desktop and Mobile) */}
        {banners.map((banner, idx) => {
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
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30" />
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
              {banners.map((_, idx) => (
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

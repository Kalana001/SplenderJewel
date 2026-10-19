'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Container } from '@/components/ui/container';
import type { HomepageSection } from '@/types/cms';
import type { CollageItem } from '@/lib/cms/homepage-view';

interface EditorialCollageProps {
  section?: HomepageSection | null;
  items: CollageItem[];
}

export function EditorialCollage({ section, items }: EditorialCollageProps) {
  const title = section?.title?.trim() || 'The Editorial Edit';
  const subtitle = section?.subtitle?.trim() || 'Curated Fashion Jewellery';

  // If no items have images, return a minimal fallback invitation
  if (!items || items.length === 0) {
    return (
      <section aria-label="Editorial Jewellery Showcase" className="py-8 sm:py-12">
        <Container size="xl">
          <div className="rounded-sm border border-neutral-850 bg-neutral-900/30 p-8 sm:p-12 text-center">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold text-xs uppercase tracking-[0.2em] mb-4">
              <Sparkles className="h-3.5 w-3.5 text-luxury-gold" />
              <span>{subtitle}</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white tracking-wide">
              {title}
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed font-light">
              Discover timeless elegance and contemporary trends across our hand-curated fashion jewellery collections.
            </p>
            <div className="mt-6">
              <Link
                href="/shop"
                className="inline-flex items-center space-x-2 text-xs uppercase tracking-widest text-luxury-gold hover:text-luxury-gold-light transition-colors"
              >
                <span>Browse All Collections</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    );
  }

  const [leadItem, ...supportingItems] = items;
  const secondaryItems = supportingItems.slice(0, 3);

  return (
    <section aria-label="Editorial Jewellery Showcase" className="py-6 sm:py-10">
      <Container size="xl">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-10 gap-4">
          <div>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-luxury-gold font-semibold">
              {subtitle}
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1 uppercase tracking-wide">
              {title}
            </h2>
          </div>

          <Link href="/shop" className="self-start sm:self-auto">
            <span className="inline-flex items-center space-x-1.5 text-xs uppercase tracking-widest text-luxury-gold hover:text-luxury-gold-light transition-colors">
              <span>View Collection</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>

        {/* Editorial Collage Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          {/* Lead / Focal Showcase Card (Takes 7 cols on desktop) */}
          <Link
            href={leadItem.href}
            className="group relative block lg:col-span-7 rounded-sm overflow-hidden bg-neutral-950 border border-neutral-850 hover:border-luxury-gold/50 transition-all duration-500 shadow-lg min-h-[340px] sm:min-h-[420px] lg:min-h-[500px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={leadItem.imageUrl}
              alt={leadItem.title}
              className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
              loading="lazy"
            />
            {/* Dark gradient overlay for typography readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

            <div className="absolute inset-0 p-5 sm:p-8 flex flex-col justify-between">
              {leadItem.tag && (
                <div className="self-start">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-sm bg-black/60 border border-luxury-gold/40 text-luxury-gold text-[10px] sm:text-xs uppercase tracking-widest backdrop-blur-sm">
                    {leadItem.tag}
                  </span>
                </div>
              )}

              <div className="space-y-1.5 sm:space-y-2 mt-auto">
                {leadItem.subtitle && (
                  <p className="text-[11px] sm:text-xs uppercase tracking-widest text-neutral-300 font-medium">
                    {leadItem.subtitle}
                  </p>
                )}
                <h3 className="font-serif text-lg sm:text-2xl font-bold text-white group-hover:text-luxury-gold transition-colors leading-tight">
                  {leadItem.title}
                </h3>
                <span className="inline-flex items-center space-x-1.5 text-xs text-luxury-gold font-medium pt-1">
                  <span>Explore piece</span>
                  <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </div>
          </Link>

          {/* Supporting Cards (Takes 5 cols on desktop) */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 sm:gap-6">
            {secondaryItems.map((item, idx) => (
              <Link
                key={item.id || idx}
                href={item.href}
                className="group relative block rounded-sm overflow-hidden bg-neutral-950 border border-neutral-850 hover:border-luxury-gold/50 transition-all duration-500 shadow-md min-h-[200px] sm:min-h-[230px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                <div className="absolute inset-0 p-4 sm:p-5 flex flex-col justify-end">
                  {item.tag && (
                    <span className="self-start mb-2 inline-flex items-center px-2 py-0.5 rounded-sm bg-black/60 border border-neutral-700 text-neutral-200 text-[10px] uppercase tracking-wider backdrop-blur-sm">
                      {item.tag}
                    </span>
                  )}
                  {item.subtitle && (
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-neutral-300">
                      {item.subtitle}
                    </p>
                  )}
                  <h3 className="font-serif text-sm sm:text-base font-semibold text-white group-hover:text-luxury-gold transition-colors line-clamp-1">
                    {item.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

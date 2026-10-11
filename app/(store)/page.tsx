import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Sparkles, Shield, Truck, MessageCircle } from 'lucide-react';
import { getWhatsAppLink } from '@/lib/config/store';

export default function HomePage() {
  const categories = [
    { name: 'Rings', href: '/category/rings', count: 'Curated Collection' },
    { name: 'Necklaces & Pendants', href: '/category/necklaces', count: 'Curated Collection' },
    { name: 'Bracelets & Bangles', href: '/category/bracelets', count: 'Curated Collection' },
    { name: 'Earrings', href: '/category/earrings', count: 'Curated Collection' },
    { name: 'Men’s Collection', href: '/category/men', count: 'Curated Collection' },
    { name: 'Jewelry Sets', href: '/category/sets', count: 'Curated Collection' },
  ];

  return (
    <div className="space-y-16 sm:space-y-24 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-black via-luxury-black to-neutral-950 py-16 sm:py-24 border-b border-neutral-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-luxury-gold/15 via-luxury-ruby/5 to-transparent pointer-events-none" />

        <Container size="xl" className="relative text-center">
          {/* Business Logo Emblem Display */}
          <div className="inline-block relative mb-6">
            <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-luxury-gold/20 via-luxury-ruby/20 to-luxury-gold/20 blur-xl opacity-60 pointer-events-none" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo.png"
              alt="Splender — The Jewel Gallery"
              className="relative h-24 sm:h-32 md:h-40 w-auto mx-auto object-contain rounded-lg border border-luxury-gold/30 p-1 bg-black/80 shadow-2xl shadow-luxury-gold/10"
            />
          </div>

          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold-light text-xs uppercase tracking-widest mb-4">
            <Sparkles className="h-3.5 w-3.5 text-luxury-gold" />
            <span>Splender — The Jewel Gallery</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white uppercase max-w-4xl mx-auto leading-tight">
            Timeless Elegance <br />
            <span className="text-luxury-gold font-normal italic">Refined Luxury</span>
          </h1>

          <p className="mt-6 text-sm sm:text-base text-neutral-300 max-w-2xl mx-auto leading-relaxed font-light">
            Discover exquisite fashion jewelry crafted for everyday distinction and special occasions.
            Gold-plated designs, tiger eye, pearl jewelry, and bespoke modern accents for women and men.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/shop">
              <Button variant="gold" size="lg" className="min-w-[160px] shadow-lg shadow-luxury-gold/10">
                Explore Catalog
              </Button>
            </Link>
            <Link href="/category/rings">
              <Button variant="ruby" size="lg" className="min-w-[160px]">
                Featured Rings
              </Button>
            </Link>
            <a
              href={getWhatsAppLink('Hello Splender Jewel, I would like to enquire about your jewelry.')}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="lg" className="min-w-[160px] space-x-2 border-neutral-700 hover:border-luxury-gold">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-sm border border-neutral-800 bg-neutral-900/50 flex items-start space-x-4">
              <div className="p-3 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-serif text-base font-semibold text-white">Curated Luxury</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Carefully selected gold-plated, tiger eye, and pearl fashion jewelry designed with fine detail.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-sm border border-neutral-800 bg-neutral-900/50 flex items-start space-x-4">
              <div className="p-3 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-serif text-base font-semibold text-white">Islandwide Home Delivery</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Safe, direct doorstep delivery across all 25 administrative districts of Sri Lanka.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-sm border border-neutral-800 bg-neutral-900/50 flex items-start space-x-4">
              <div className="p-3 rounded-sm bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-serif text-base font-semibold text-white">Personal Customer Care</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Convenient Cash on Delivery and direct WhatsApp Bank Transfer support.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Categories Grid Skeleton */}
      <section>
        <Container size="xl">
          <div className="text-center mb-10">
            <span className="text-xs uppercase tracking-[0.25em] text-luxury-gold font-semibold">
              Browse Collections
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1 uppercase">
              Jewelry by Category
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {categories.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="group relative block p-6 sm:p-8 rounded-sm border border-neutral-800 bg-neutral-900/40 hover:border-luxury-gold/50 transition-all text-center"
              >
                <div className="h-10 w-10 mx-auto mb-3 rounded-full bg-neutral-800 flex items-center justify-center text-luxury-gold group-hover:scale-110 transition-transform">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h4 className="font-serif text-sm sm:text-base font-semibold text-white group-hover:text-luxury-gold transition-colors">
                  {cat.name}
                </h4>
                <p className="text-[11px] text-neutral-500 mt-1">{cat.count}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}

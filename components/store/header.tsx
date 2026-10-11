'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Search, User, Menu, X, Heart } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { getStoreConfig } from '@/lib/config/store';

interface HeaderProps {
  logoUrl?: string | null;
}

export function StoreHeader({ logoUrl }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const config = getStoreConfig();

  const navLinks = [
    { label: 'Shop All', href: '/shop' },
    { label: 'Rings', href: '/category/rings' },
    { label: 'Necklaces', href: '/category/necklaces' },
    { label: 'Bracelets', href: '/category/bracelets' },
    { label: 'Earrings', href: '/category/earrings' },
    { label: 'Men’s Collection', href: '/category/men' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-luxury-black/95 text-white backdrop-blur-md border-b border-neutral-800">
      {/* Optional Top Announcement Bar */}
      {config.announcementBanner?.enabled && (
        <div className="bg-luxury-gold/20 text-luxury-gold-light text-xs text-center py-1.5 px-4 font-medium border-b border-luxury-gold/20">
          {config.announcementBanner.text}
        </div>
      )}

      {/* Main Centered Header Bar */}
      <Container size="xl">
        <div className="grid grid-cols-3 items-center py-3 sm:py-4">
          {/* Left Column: Mobile Menu Toggle & Desktop Search Action */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button
              type="button"
              className="inline-flex lg:hidden p-2 text-neutral-300 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            <Link
              href="/search"
              className="hidden sm:inline-flex items-center space-x-2 text-xs uppercase tracking-widest text-neutral-300 hover:text-luxury-gold transition-colors py-1.5 px-3 rounded border border-neutral-800 hover:border-luxury-gold/40 bg-neutral-900/50"
              aria-label="Search Catalog"
            >
              <Search className="h-3.5 w-3.5 text-luxury-gold" />
              <span>Search</span>
            </Link>
          </div>

          {/* Center Column: Perfectly Centered Brand Logo & Typography */}
          <div className="flex justify-center items-center">
            <Link href="/" className="flex flex-col items-center group text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl || config.logoUrl || '/images/logo.png'}
                alt={config.storeName}
                className="h-10 sm:h-12 md:h-14 w-auto object-contain rounded border border-luxury-gold/40 p-0.5 bg-black transition-transform duration-300 group-hover:scale-105 shadow-md shadow-black"
              />
              <span className="font-serif text-lg sm:text-xl md:text-2xl font-bold tracking-[0.25em] text-white group-hover:text-luxury-gold-hover transition-colors uppercase mt-1 leading-none">
                Splender
              </span>
              <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.35em] text-luxury-gold font-medium mt-0.5">
                The Jewel Gallery
              </span>
            </Link>
          </div>

          {/* Right Column: Customer Utilities (Search on mobile, Wishlist, Account, Cart) */}
          <div className="flex items-center justify-end space-x-2 sm:space-x-3">
            <Link
              href="/search"
              className="inline-flex sm:hidden p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Search Catalog"
            >
              <Search className="h-5 w-5" />
            </Link>

            <Link
              href="/account/wishlist"
              className="p-2 text-neutral-300 hover:text-luxury-ruby transition-colors"
              aria-label="Wishlist"
            >
              <Heart className="h-5 w-5" />
            </Link>

            <Link
              href="/account"
              className="hidden sm:inline-flex p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Account"
            >
              <User className="h-5 w-5" />
            </Link>

            <Link
              href="/cart"
              className="relative p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Shopping Cart"
            >
              <ShoppingBag className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </Container>

      {/* Dedicated Centered Navigation Row */}
      <nav className="hidden lg:block border-t border-neutral-800/80 bg-black/60">
        <Container size="xl">
          <div className="flex items-center justify-center space-x-8 py-2.5 text-xs tracking-[0.2em] uppercase font-medium">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-neutral-300 hover:text-luxury-gold transition-colors py-1 relative group"
              >
                <span>{link.label}</span>
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-luxury-gold transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
          </div>
        </Container>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-neutral-800 bg-luxury-black/98 px-4 py-6 space-y-4">
          <nav className="flex flex-col space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium uppercase tracking-wider text-neutral-300 hover:text-luxury-gold py-2 border-b border-neutral-800/50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

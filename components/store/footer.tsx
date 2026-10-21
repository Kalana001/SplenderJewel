import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { getStoreConfig, getWhatsAppLink, getInstagramLink } from '@/lib/config/store';
import { MessageCircle } from 'lucide-react';
import { InstagramIcon } from '@/components/icons/instagram';
import type { Category } from '@/types/product';

interface FooterProps {
  categories?: Category[];
}

export function StoreFooter({ categories = [] }: FooterProps = {}) {
  const config = getStoreConfig();
  const currentYear = new Date().getFullYear();

  const activeCategories = (categories || [])
    .filter((cat) => Boolean(cat && cat.slug && cat.name && cat.isActive !== false))
    .slice(0, 6);

  return (
    <footer className="bg-luxury-black text-neutral-300 border-t border-neutral-800 pt-16 pb-12 text-sm">
      <Container size="xl">
        {/* Accessible intermediate heading for landmark navigation */}
        <h2 className="sr-only">Footer Navigation and Boutique Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand & Mission */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={config.logoUrl || '/images/logo.png'}
                alt={config.storeName}
                className="h-12 w-auto object-contain rounded border border-luxury-gold/30 p-0.5 bg-black"
              />
              <div className="flex flex-col">
                <span className="font-serif text-lg font-bold tracking-[0.2em] text-white uppercase block">
                  Splender
                </span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-medium">
                  The Jewel Gallery
                </span>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Curated fashion jewellery and accessories bringing together elegance, modern trends, and timeless style across Sri Lanka.
            </p>
            <div className="space-y-2 pt-1">
              <a
                href={getWhatsAppLink('Hello Splender Jewel, I have an enquiry.')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-xs text-luxury-gold hover:text-luxury-gold-light transition-colors py-1"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>Chat with us on WhatsApp</span>
              </a>
              <div>
                <a
                  href={getInstagramLink(config)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 text-xs text-luxury-gold hover:text-luxury-gold-light transition-colors py-1"
                >
                  <InstagramIcon className="h-4 w-4 shrink-0" />
                  <span>Follow @splender_jewel on Instagram</span>
                </a>
              </div>
            </div>
          </div>

          {/* Quick Collections */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest font-semibold text-white">Collections</h3>
            <ul className="space-y-1 sm:space-y-1.5 text-xs">
              {activeCategories.length > 0 ? (
                activeCategories.map((cat) => (
                  <li key={cat.id || cat.slug}>
                    <Link href={`/category/${cat.slug}`} className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                      {cat.name}
                    </Link>
                  </li>
                ))
              ) : (
                <li>
                  <Link href="/shop" className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                    All Jewelry Pieces
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* Customer Support */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest font-semibold text-white">Customer Care</h3>
            <ul className="space-y-1 sm:space-y-1.5 text-xs">
              <li>
                <Link href="/faq" className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                  Frequently Asked Questions
                </Link>
              </li>
              <li>
                <Link href="/returns" className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                  Returns & Exchanges
                </Link>
              </li>
              <li>
                <Link href="/contact" className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/account/orders" className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                  Order History (Account)
                </Link>
              </li>
              <li className="pt-2 text-neutral-400 text-[11px] leading-relaxed border-t border-neutral-900 mt-2">
                <span>Guest orders: Refer to your order confirmation email / WhatsApp, or </span>
                <Link href="/contact" className="text-luxury-gold hover:underline">
                  contact customer support
                </Link>
                <span> with your order number.</span>
              </li>
            </ul>
          </div>

          {/* Legal & Policies */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest font-semibold text-white">Legal & Policies</h3>
            <ul className="space-y-1 sm:space-y-1.5 text-xs">
              <li>
                <Link href="/privacy" className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/about" className="block py-1 sm:py-0.5 hover:text-luxury-gold transition-colors">
                  About Splender Jewel
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p>© {currentYear} {config.storeName}. All rights reserved.</p>
          <div className="flex items-center space-x-4">
            <a
              href={getInstagramLink(config)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-luxury-gold transition-colors inline-flex items-center space-x-1.5"
              aria-label="Follow Splender Jewel on Instagram"
            >
              <InstagramIcon className="h-3.5 w-3.5" />
              <span className="text-[11px]">@splender_jewel</span>
            </a>
            <span className="text-neutral-700">|</span>
            <p className="text-[11px] text-neutral-600">
              Islandwide Delivery across Sri Lanka
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}

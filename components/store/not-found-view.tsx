import React from 'react';
import Link from 'next/link';
import { Package, Search, ArrowRight, Home, MessageCircle } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { getWhatsAppLink } from '@/lib/config/store';

interface NotFoundViewProps {
  title?: string;
  description?: string;
}

export function NotFoundView({
  title = 'Page Not Found',
  description = 'The jewelry piece or page you are looking for may have been moved, renamed, or is no longer available.',
}: NotFoundViewProps) {
  const whatsAppLink = getWhatsAppLink(
    'Hello Splender Jewel, I was looking for a page or piece on your website that seems to be missing and would like some assistance.'
  );

  return (
    <Container size="xl" className="py-16 sm:py-24">
      <div className="max-w-xl mx-auto text-center space-y-6">
        {/* Subtle decorative gold badge/icon */}
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold mb-2 shadow-lg shadow-black/40">
          <Package className="h-10 w-10 stroke-[1.5]" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] uppercase tracking-[0.28em] text-luxury-gold font-semibold block">
            Splender Jewel • 404
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-white tracking-tight leading-tight">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-neutral-400 leading-relaxed max-w-md mx-auto font-light">
            {description}
          </p>
        </div>

        {/* Primary Action Links */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/shop" className="w-full sm:w-auto">
            <Button
              variant="gold"
              size="lg"
              className="w-full sm:w-auto min-w-[190px] min-h-[44px] h-12 text-xs uppercase tracking-[0.16em] font-semibold space-x-2 shadow-lg shadow-luxury-gold/15"
            >
              <span>Explore Collection</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>

          <Link href="/" className="w-full sm:w-auto">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-w-[170px] min-h-[44px] h-12 text-xs uppercase tracking-[0.16em] font-medium border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:text-white hover:border-luxury-gold/50 space-x-2"
            >
              <Home className="h-4 w-4 text-luxury-gold" />
              <span>Return Home</span>
            </Button>
          </Link>
        </div>

        {/* Search & Concierge WhatsApp Prompt */}
        <div className="pt-8 border-t border-neutral-800/80 flex flex-col items-center space-y-3">
          <p className="text-xs text-neutral-400">
            Looking for something specific? Search our catalog or connect directly with our boutique.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
            <Link
              href="/search"
              className="inline-flex items-center space-x-1.5 text-luxury-gold hover:text-luxury-gold-light transition-colors py-1"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search Jewelry</span>
            </Link>
            <span className="text-neutral-700" aria-hidden="true">•</span>
            <a
              href={whatsAppLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 text-luxury-gold hover:text-luxury-gold-light transition-colors py-1"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>WhatsApp Concierge (+94 76 468 9907)</span>
            </a>
          </div>
        </div>
      </div>
    </Container>
  );
}

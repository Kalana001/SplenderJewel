'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ShoppingBag, Home, MessageCircle } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { getWhatsAppLink } from '@/lib/config/store';

interface StoreErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StoreError({ error, reset }: StoreErrorProps) {
  useEffect(() => {
    // Log safe, non-sensitive error telemetry without leaking raw messages, stacks, or customer data
    console.error('[Storefront Error Boundary] Caught runtime error:', {
      name: error?.name || 'Error',
      digest: error?.digest || 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  const whatsAppLink = getWhatsAppLink(
    'Hello Splender Jewel, I experienced an unexpected issue while browsing the store and would like assistance.'
  );

  return (
    <Container size="xl" className="py-16 sm:py-24">
      <div className="max-w-xl mx-auto text-center space-y-6">
        {/* Subtle decorative amber/gold alert indicator */}
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-2 shadow-lg shadow-black/40">
          <AlertTriangle className="h-10 w-10 stroke-[1.5]" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] uppercase tracking-[0.28em] text-luxury-gold font-semibold block">
            Splender Jewel • Service Notice
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-white tracking-tight leading-tight">
            Unable to Display Page
          </h1>
          <p className="text-sm sm:text-base text-neutral-400 leading-relaxed max-w-md mx-auto font-light">
            We experienced an unexpected interruption loading this piece. Please try reloading the page or return to our jewelry collection.
          </p>
        </div>

        {/* Primary Action Controls: Try Again & Recovery Links */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            type="button"
            variant="gold"
            size="lg"
            onClick={() => reset()}
            className="w-full sm:w-auto min-w-[170px] min-h-[44px] h-12 text-xs uppercase tracking-[0.16em] font-semibold space-x-2 shadow-lg shadow-luxury-gold/15"
            aria-label="Try again to reload page"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try Again</span>
          </Button>

          <Link href="/shop" className="w-full sm:w-auto">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-w-[180px] min-h-[44px] h-12 text-xs uppercase tracking-[0.16em] font-medium border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:text-white hover:border-luxury-gold/50 space-x-2"
            >
              <ShoppingBag className="h-4 w-4 text-luxury-gold" />
              <span>Explore Collection</span>
            </Button>
          </Link>
        </div>

        {/* Home & Concierge Assistance Links */}
        <div className="pt-8 border-t border-neutral-800/80 flex flex-col items-center space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
            <Link
              href="/"
              className="inline-flex items-center space-x-1.5 text-luxury-gold hover:text-luxury-gold-light transition-colors py-1"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Return Home</span>
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

          {error?.digest && (
            <p className="text-[11px] font-mono text-neutral-600 tracking-wider">
              Error Reference: {error.digest}
            </p>
          )}
        </div>
      </div>
    </Container>
  );
}

import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles } from 'lucide-react';

interface StorePageSkeletonProps {
  title: string;
  category?: string;
  description?: string;
  phase?: string;
}

export function StorePageSkeleton({
  title,
  category = 'Splender Jewel Storefront',
  description = 'This section will be connected to the catalog and Supabase database in subsequent implementation phases.',
  phase = 'Phase 1 / Phase 2',
}: StorePageSkeletonProps) {
  return (
    <div className="py-16 sm:py-24">
      <Container size="lg">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-luxury-gold text-xs uppercase tracking-widest">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{category}</span>
          </div>

          <h1 className="font-serif text-2xl sm:text-4xl font-bold tracking-tight text-white uppercase">
            {title}
          </h1>

          <p className="text-sm text-neutral-400 leading-relaxed font-light">
            {description}
          </p>

          <div className="p-4 rounded-sm border border-neutral-800 bg-neutral-900/30 text-xs text-neutral-500">
            <span>Scheduled Implementation: <strong className="text-neutral-300">{phase}</strong></span>
          </div>

          <div className="pt-4 flex justify-center">
            <Link href="/">
              <Button variant="outline" size="md" className="space-x-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Return to Storefront Home</span>
              </Button>
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}

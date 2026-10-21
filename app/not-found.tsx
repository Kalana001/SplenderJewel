import React from 'react';
import type { Metadata } from 'next';
import { StoreHeader } from '@/components/store/header';
import { StoreFooter } from '@/components/store/footer';
import { CartProvider } from '@/lib/cart/cart-context';
import { getPublicCategories } from '@/lib/catalog/public';
import { DEFAULT_STORE_CATEGORIES } from '@/lib/config/store';
import { NotFoundView } from '@/components/store/not-found-view';
import type { Category } from '@/types/product';

export const metadata: Metadata = {
  title: 'Page Not Found',
  description: 'The requested luxury jewelry piece or page could not be found.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RootNotFound() {
  let categories: Category[] = [];
  try {
    categories = await getPublicCategories();
  } catch (err) {
    console.error('[RootNotFound] Error loading categories for 404 shell:', err);
    categories = DEFAULT_STORE_CATEGORIES;
  }

  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
        <StoreHeader categories={categories} />
        <main className="flex-1">
          <NotFoundView />
        </main>
        <StoreFooter categories={categories} />
      </div>
    </CartProvider>
  );
}

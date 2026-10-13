import React from 'react';
import { StoreHeader } from '@/components/store/header';
import { StoreFooter } from '@/components/store/footer';
import { CartProvider } from '@/lib/cart/cart-context';
import { getPublicCategories } from '@/lib/catalog/public';
import { DEFAULT_STORE_CATEGORIES } from '@/lib/config/store';
import type { Category } from '@/types/product';

export const revalidate = 60;

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let categories: Category[] = [];
  try {
    categories = await getPublicCategories();
  } catch (err) {
    console.error('[StoreLayout] Database error fetching categories for layout, falling back to default categories:', err);
    categories = DEFAULT_STORE_CATEGORIES;
  }

  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
        <StoreHeader categories={categories} />
        <main className="flex-1">{children}</main>
        <StoreFooter categories={categories} />
      </div>
    </CartProvider>
  );
}


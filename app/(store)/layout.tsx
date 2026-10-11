import React from 'react';
import { StoreHeader } from '@/components/store/header';
import { StoreFooter } from '@/components/store/footer';
import { CartProvider } from '@/lib/cart/cart-context';

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
        <StoreHeader />
        <main className="flex-1">{children}</main>
        <StoreFooter />
      </div>
    </CartProvider>
  );
}


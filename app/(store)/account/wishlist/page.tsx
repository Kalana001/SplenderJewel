import React from 'react';
import { Container } from '@/components/ui/container';
import { WishlistManager } from '@/components/store/wishlist-manager';
import { getCustomerWishlist } from '@/lib/wishlist/actions';

export const metadata = {
  title: 'My Wishlist | Splender Jewel',
  description: 'View and manage your saved luxury jewelry pieces.',
};

const WISHLIST_LOAD_ERROR_MESSAGE =
  "We couldn't load your saved pieces right now. Please try again in a moment.";

export default async function AccountWishlistPage() {
  const res = await getCustomerWishlist();

  // Never forward raw database errors to the client; show a customer-safe message instead
  // of silently presenting a failed load as an empty wishlist.
  const loadError = res.success ? null : WISHLIST_LOAD_ERROR_MESSAGE;
  const items = res.success ? res.items : [];

  return (
    <Container size="xl" className="py-8 sm:py-12 lg:py-16">
      {/* Keyed by load status so a successful retry remounts with fresh server data. */}
      <WishlistManager key={res.success ? 'ready' : 'error'} initialItems={items} loadError={loadError} />
    </Container>
  );
}

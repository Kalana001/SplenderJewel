import React from 'react';
import { Container } from '@/components/ui/container';
import { WishlistManager } from '@/components/store/wishlist-manager';
import { getCustomerWishlist } from '@/lib/wishlist/actions';

export const metadata = {
  title: 'My Wishlist | Splender Jewel',
  description: 'View and manage your saved luxury jewelry pieces.',
};

export default async function AccountWishlistPage() {
  const res = await getCustomerWishlist();
  const items = res.success ? res.items : [];

  return (
    <Container size="xl" className="py-10 sm:py-16">
      <WishlistManager initialItems={items} />
    </Container>
  );
}

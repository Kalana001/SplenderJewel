import React from 'react';
import { redirect } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { AddressesManager } from '@/components/store/addresses-manager';
import { getCustomerAddresses } from '@/lib/addresses/actions';
import { getCurrentUser } from '@/lib/auth/server';

export const metadata = {
  title: 'Saved Delivery Addresses | Splender Jewel',
  description: 'Manage home and office delivery addresses across Sri Lanka for fast checkout.',
};

export default async function AccountAddressesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?redirectTo=/account/addresses');
  }

  const res = await getCustomerAddresses();
  const addresses = res.success ? res.addresses : [];

  return (
    <Container size="xl" className="py-10 sm:py-16">
      <AddressesManager initialAddresses={addresses} />
    </Container>
  );
}

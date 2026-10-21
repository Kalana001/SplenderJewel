import React from 'react';
import type { Metadata } from 'next';
import { NotFoundView } from '@/components/store/not-found-view';

export const metadata: Metadata = {
  title: 'Page Not Found',
  description: 'The requested luxury jewelry piece or page could not be found.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function StoreNotFound() {
  return <NotFoundView />;
}

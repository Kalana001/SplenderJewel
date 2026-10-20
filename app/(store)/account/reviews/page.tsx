import React from 'react';
import { redirect } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { CustomerReviewsManager } from '@/components/store/customer-reviews-manager';
import { getCustomerReviews, getEligibleReviewProducts } from '@/lib/reviews/customer-actions';
import { getCurrentUser } from '@/lib/auth/server';

export const metadata = {
  title: 'My Product Reviews',
  description: 'Submit and manage verified purchase product reviews for delivered jewelry pieces.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AccountReviewsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?redirectTo=/account/reviews');
  }

  const [reviewsRes, eligibleRes] = await Promise.all([
    getCustomerReviews(),
    getEligibleReviewProducts(),
  ]);

  const reviews = reviewsRes.success ? reviewsRes.reviews : [];
  const eligible = eligibleRes.success ? eligibleRes.eligibleItems : [];

  return (
    <Container size="xl" className="py-10 sm:py-16">
      <CustomerReviewsManager
        initialReviews={reviews}
        initialEligible={eligible}
      />
    </Container>
  );
}

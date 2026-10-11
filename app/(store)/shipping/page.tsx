import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const metadata = {
  title: 'Shipping & Delivery | Splender Jewel',
  description: 'Doorstep courier delivery across all 25 districts in Sri Lanka. Fast, insured, and tracked dispatch.',
};

export default async function ShippingPage() {
  const page = await getPublicContentPage('shipping');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const revalidate = 60;

export const metadata = {
  title: 'Frequently Asked Questions',
  description: 'Find answers regarding Splender Jewel fashion jewellery, Islandwide Delivery via Sri Lanka Post, and payment methods.',
};

export default async function FAQPage() {
  const page = await getPublicContentPage('faq');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

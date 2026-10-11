import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const metadata = {
  title: 'Frequently Asked Questions | Splender Jewel',
  description: 'Common questions on jewelry care, islandwide delivery in Sri Lanka, and payment verification.',
};

export default async function FAQPage() {
  const page = await getPublicContentPage('faq');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

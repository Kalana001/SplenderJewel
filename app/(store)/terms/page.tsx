import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const revalidate = 60;

export const metadata = {
  title: 'Terms & Conditions',
  description: 'Terms and conditions for orders, purchases, and services on Splender Jewel.',
};

export default async function TermsPage() {
  const page = await getPublicContentPage('terms');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

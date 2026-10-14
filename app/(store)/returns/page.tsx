import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const revalidate = 60;

export const metadata = {
  title: 'Returns & Exchanges | Splender Jewel',
  description: 'Returns and exchanges policy for Splender Jewel fashion jewellery and accessories.',
};

export default async function ReturnsPage() {
  const page = await getPublicContentPage('returns');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const revalidate = 60;

export const metadata = {
  title: 'Returns & Exchanges | Splender Jewel',
  description: 'Quality guarantee and straightforward exchange policy for our fine jewelry collections.',
};

export default async function ReturnsPage() {
  const page = await getPublicContentPage('returns');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

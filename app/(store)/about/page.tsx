import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const metadata = {
  title: 'About Splender Jewel | Our Heritage & Fine Fashion Jewelry',
  description: 'Curated fine fashion jewelry for women and men in Sri Lanka. Timeless elegance and modern luxury.',
};

export default async function AboutPage() {
  const page = await getPublicContentPage('about');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

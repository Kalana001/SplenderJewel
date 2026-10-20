import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const revalidate = 60;

export const metadata = {
  title: 'About Us',
  description: 'Discover Splender Jewel — stylish fashion jewellery and accessories based in Negombo, Sri Lanka, with Islandwide Delivery.',
};

export default async function AboutPage() {
  const page = await getPublicContentPage('about');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

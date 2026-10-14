import { notFound } from 'next/navigation';
import { getPublicContentPage } from '@/lib/cms/public';
import { ContentPageViewer } from '@/components/store/content-page-viewer';

export const revalidate = 60;

export const metadata = {
  title: 'Privacy Policy | Splender Jewel',
  description: 'How Splender Jewel protects your privacy, personal information, and delivery coordinates.',
};

export default async function PrivacyPage() {
  const page = await getPublicContentPage('privacy');
  if (!page) notFound();

  return <ContentPageViewer page={page} />;
}

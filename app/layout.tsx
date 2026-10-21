import type { Metadata, Viewport } from 'next';
import { getCanonicalSiteUrl } from '@/lib/auth/redirect';
import './globals.css';

const siteUrl = getCanonicalSiteUrl();

export const metadata: Metadata = {
  title: {
    template: '%s | Splender Jewel',
    default: 'Splender Jewel | Fashion Jewellery & Accessories — Sri Lanka',
  },
  description:
    'Discover Splender Jewel — stylish fashion jewellery and accessories based in Negombo, Sri Lanka. Elegance, modern trends, and timeless style with Islandwide Delivery.',
  metadataBase: new URL(siteUrl),
  icons: {
    icon: '/images/logo.png',
    apple: '/images/logo.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_LK',
    siteName: 'Splender Jewel',
    images: [
      {
        url: '/images/logo.png',
        width: 800,
        height: 800,
        alt: 'Splender Jewel',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Splender Jewel | Fashion Jewellery & Accessories — Sri Lanka',
    description:
      'Discover Splender Jewel — stylish fashion jewellery and accessories based in Negombo, Sri Lanka. Elegance, modern trends, and timeless style with Islandwide Delivery.',
    images: ['/images/logo.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0A0A0A',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}

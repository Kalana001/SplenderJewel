import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  (process.env.NODE_ENV === 'production' ? 'https://splenderjewel.com' : 'http://localhost:3000');

export const metadata: Metadata = {
  title: {
    template: '%s | Splender Jewel',
    default: 'Splender Jewel | Timeless Elegance & Luxury Jewelry',
  },
  description:
    'Curated fine fashion jewelry collections for women and men. Discover gold-plated, tiger eye, pearl jewelry, rings, necklaces, bracelets, and earrings with islandwide home delivery in Sri Lanka.',
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: 'website',
    locale: 'en_LK',
    siteName: 'Splender Jewel',
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
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}

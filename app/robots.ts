import type { MetadataRoute } from 'next';
import { getCanonicalSiteUrl } from '@/lib/auth/redirect';

/**
 * Next.js App Router robots.txt generator.
 *
 * Directs search engine crawlers to public storefront catalog surfaces
 * while disallowing crawling of administration, customer account, cart,
 * checkout, and private transactional endpoints.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getCanonicalSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/account',
          '/account/',
          '/checkout',
          '/checkout/',
          '/cart',
          '/cart/',
          '/order-confirmation',
          '/order-confirmation/',
          '/api/',
          '/auth/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

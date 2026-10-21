import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/admin/print-labels': ['./lib/shipping/templates/**/*'],
    '/**': ['./lib/shipping/templates/**/*'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/shipping',
        destination: '/faq',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

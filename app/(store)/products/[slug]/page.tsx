import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicProductBySlug, getStoreWhatsAppNumber } from '@/lib/catalog/public';
import { ProductDetailViewer } from '@/components/store/product-detail-viewer';
import { Container } from '@/components/ui/container';
import { getCurrentUser } from '@/lib/auth/server';
import { getCustomerWishlist } from '@/lib/wishlist/actions';

export const revalidate = 300;

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);

  if (!product) {
    return {
      title: 'Product Not Found',
    };
  }

  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];
  const rawTitle = (product.metaTitle || product.name || '').trim();
  const cleanTitle = rawTitle.replace(/\s*\|\s*Splender(?:\s*Jewel|—\s*The\s*Jewel\s*Gallery)?$/i, '').trim() || product.name;
  const pageDescription =
    product.metaDescription ||
    product.shortDescription ||
    `Order ${product.name} online in Sri Lanka. Fine fashion jewelry by Splender Jewel with islandwide delivery.`;

  return {
    title: cleanTitle,
    description: pageDescription,
    alternates: {
      canonical: `/products/${product.slug}`,
    },
    openGraph: {
      title: `${cleanTitle} | Splender Jewel`,
      description: pageDescription,
      url: `/products/${product.slug}`,
      siteName: 'Splender Jewel',
      images: primaryImage ? [{ url: primaryImage.url, alt: primaryImage.altText || product.name }] : [],
      type: 'website',
    },
  };
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = await params;

  const [product, whatsAppNumber, user, wishlistRes] = await Promise.all([
    getPublicProductBySlug(slug),
    getStoreWhatsAppNumber(),
    getCurrentUser(),
    getCustomerWishlist(),
  ]);

  if (!product) {
    notFound();
  }

  const isWishlisted = Boolean(wishlistRes?.items?.some((item) => item.productId === product.id));
  const isAuthenticated = Boolean(user);

  // Safely construct Schema.org Product structured data (no confidential data or exact stock)
  const isAvailable = product.variants.some((v) => v.stockStatus !== 'out_of_stock');
  const displayPrice = product.baseDiscountPrice || product.basePrice;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.metaDescription || product.shortDescription || product.description || undefined,
    image: product.images.map((img) => img.url),
    sku: product.variants[0]?.sku || product.productCode || undefined,
    brand: {
      '@type': 'Brand',
      name: 'Splender Jewel',
    },
    offers: {
      '@type': 'Offer',
      price: displayPrice.toString(),
      priceCurrency: 'LKR',
      availability: isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  return (
    <div className="py-8 sm:py-12 bg-luxury-black min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Container size="xl">
        <ProductDetailViewer
          product={product}
          storeWhatsAppNumber={whatsAppNumber}
          initialIsWishlisted={isWishlisted}
          isAuthenticated={isAuthenticated}
        />
      </Container>
    </div>
  );
}

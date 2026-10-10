import type { SriLankaDistrict } from '@/lib/config/districts';

/**
 * District-Based Delivery Pricing
 */
export interface DistrictDeliveryRate {
  id: string;
  district: SriLankaDistrict;
  deliveryFee: number;
  estimatedDeliveryDays?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Homepage Promotional Banner
 */
export interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  mobileImageUrl?: string | null;
  linkUrl?: string | null;
  buttonText?: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

/**
 * Dynamic Homepage Section Configuration
 */
export interface HomepageSection {
  id: string;
  sectionKey: 'hero' | 'categories' | 'featured' | 'new_arrivals' | 'best_sellers' | 'reviews' | 'why_choose_us' | 'instagram' | 'newsletter';
  title?: string | null;
  subtitle?: string | null;
  displayOrder: number;
  isEnabled: boolean;
  configData?: Record<string, unknown>;
}

/**
 * Verified Customer Review (Delivered orders only)
 */
export interface ProductReview {
  id: string;
  productId: string;
  variantId?: string | null;
  orderId: string;
  userId?: string | null;
  customerName: string;
  rating: number; // 1 to 5
  title?: string | null;
  comment?: string | null;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  createdAt: string;
}

/**
 * Content Pages (About, FAQ, Shipping, Returns, Privacy, Terms)
 */
export interface ContentPage {
  id: string;
  slug: string;
  title: string;
  content: string; // Markdown / HTML
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
}

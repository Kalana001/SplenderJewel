import type { StockStatus } from '@/lib/config/constants';

/**
 * Product Image Model
 */
export interface ProductImage {
  id: string;
  productId: string;
  variantId?: string | null;
  url: string;
  altText?: string | null;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

/**
 * Variant Attribute (e.g. { name: "Color", value: "Gold" }, { name: "Size", value: "17cm" })
 */
export interface VariantAttribute {
  name: string;
  value: string;
}

/**
 * Customer-Facing (Public) Product Variant
 * CRITICAL SECURITY & PRIVACY GUARANTEE:
 * - NEVER includes `purchaseCost` (strictly confidential accounting data)
 * - NEVER includes exact `stockQuantity` or internal `lowStockThreshold` (protects warehouse counts & sales velocity)
 * - Only reveals general customer-safe `stockStatus` ('in_stock' | 'low_stock' | 'out_of_stock')
 */
export interface ProductVariantPublic {
  id: string;
  productId: string;
  sku: string;
  title: string;
  attributes: Record<string, string>; // e.g. { color: "Gold", size: "17cm" }
  price: number;
  discountPrice?: number | null;
  stockQuantity?: number; // Available inventory for storefront quantity bounds and cart validation
  stockStatus: StockStatus;
  images: ProductImage[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin-Only Product Variant
 * Includes private inventory management & accounting data.
 */
export interface ProductVariantAdmin extends ProductVariantPublic {
  stockQuantity: number;
  lowStockThreshold: number;
  purchaseCost: number; // Strictly confidential business cost
}

/**
 * Product Category
 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

/**
 * Base Product Definition
 */
export interface ProductBase {
  id: string;
  name: string;
  slug: string;
  productCode?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  material?: string | null; // e.g. "Gold-plated", "Tiger Eye", "Pearl"
  gender: 'women' | 'men' | 'unisex';
  categoryId?: string | null;
  category?: Category | null;
  images: ProductImage[];
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isActive: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Customer-Facing (Public) Product
 */
export interface ProductPublic extends ProductBase {
  variants: ProductVariantPublic[];
  basePrice: number; // Lowest active variant price for display
  baseDiscountPrice?: number | null;
}

/**
 * Admin Product
 */
export interface ProductAdmin extends ProductBase {
  variants: ProductVariantAdmin[];
}

export interface WishlistProduct {
  id: string; // Wishlist item ID
  productId: string;
  variantId?: string | null;
  productName: string;
  slug: string;
  variantTitle?: string | null;
  sku?: string | null;
  price: number;
  discountPrice?: number | null;
  imageUrl?: string | null;
  stockStatus: string;
  addedAt: string;
}

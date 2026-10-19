/**
 * Cart Item and Cart State Types
 * Used across client context, server actions, and storefront components.
 */

export interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  price: number;
  discountPrice?: number | null;
  imageUrl?: string | null;
  slug: string;
  quantity: number;
  maxStock?: number;
}

export type AddToCartInput = Omit<CartItem, 'quantity'>;

export interface AddToCartResult {
  success: boolean;
  addedQuantity: number;
  totalQuantity: number;
  error?: string;
}

export interface UpdateQuantityResult {
  success: boolean;
  updatedQuantity: number;
  error?: string;
}

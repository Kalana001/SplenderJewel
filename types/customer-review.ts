export interface CustomerReviewItem {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productImage?: string | null;
  variantTitle?: string | null;
  orderId: string;
  orderNumber?: string;
  orderItemId: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  createdAt: string;
}

export interface EligibleReviewItem {
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  deliveredAt: string;
  productId: string;
  productName: string;
  productSlug: string;
  productImage?: string | null;
  variantId?: string | null;
  variantTitle?: string | null;
}

export interface SubmitReviewInput {
  orderItemId: string;
  productId: string;
  variantId?: string | null;
  orderId: string;
  rating: number;
  title?: string;
  comment: string;
}

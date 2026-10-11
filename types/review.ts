export interface ProductReview {
  id: string;
  productId: string;
  productName?: string;
  variantId: string | null;
  orderId: string;
  orderItemId: string;
  userId: string | null;
  customerName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewFilter {
  status?: 'all' | 'pending' | 'approved';
  search?: string;
  productId?: string;
  rating?: number;
}

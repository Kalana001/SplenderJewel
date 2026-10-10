import type { OrderStatus, PaymentMethod, PaymentStatus } from '@/lib/config/constants';
import type { SriLankaDistrict } from '@/lib/config/districts';

/**
 * Customer Shipping & Contact Information
 */
export interface ShippingAddress {
  fullName: string;
  phone1: string;
  phone2?: string | null;
  email?: string | null;
  addressLine: string;
  city?: string | null;
  district: SriLankaDistrict;
  province?: string | null;
  postalCode?: string | null;
  deliveryNotes?: string | null;
}

/**
 * Single Item in an Order
 */
export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  purchaseCost?: number; // ADMIN-ONLY: omitted for customer views
}

/**
 * Order Status Transition History Record
 */
export interface OrderStatusHistoryItem {
  id: string;
  orderId: string;
  previousStatus?: string | null;
  newStatus: OrderStatus;
  changedBy?: string | null;
  notes?: string | null;
  createdAt: string;
}

/**
 * Database Row Representation (matches public.orders schema exactly)
 */
export interface OrderDbRow {
  id: string;
  order_number: string;
  order_token: string;
  user_id: string | null;
  customer_name: string;
  email: string | null;
  phone1: string;
  phone2: string | null;
  address_line: string;
  city: string | null;
  district: string;
  province: string | null;
  postal_code: string | null;
  delivery_notes: string | null;
  delivery_fee: number;
  subtotal: number;
  discount_amount: number;
  coupon_code: string | null;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  tracking_number: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Order Domain Model (Structured for application logic & UI)
 */
export interface Order {
  id: string;
  orderNumber: string; // Human-readable: "SJ-YYYYMMDD-XXXX"
  orderToken?: string; // Unguessable token for secure guest order confirmation access
  userId?: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shippingAddress: ShippingAddress;
  items?: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  couponCode?: string | null;
  totalAmount: number;
  trackingNumber?: string | null;
  adminNotes?: string | null;
  statusHistory?: OrderStatusHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Maps a flat database order row and optional items into the structured Order domain model
 */
export function mapDbOrderToDomain(row: OrderDbRow, items: OrderItem[] = []): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    orderToken: row.order_token,
    userId: row.user_id,
    status: row.order_status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    shippingAddress: {
      fullName: row.customer_name,
      phone1: row.phone1,
      phone2: row.phone2,
      email: row.email,
      addressLine: row.address_line,
      city: row.city,
      district: row.district as SriLankaDistrict,
      province: row.province,
      postalCode: row.postal_code,
      deliveryNotes: row.delivery_notes,
    },
    items,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discountAmount: row.discount_amount,
    couponCode: row.coupon_code,
    totalAmount: row.total_amount,
    trackingNumber: row.tracking_number,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Admin Package Print Label Model
 * Restricted strictly to: Customer Name, Address, Contact Number
 */
export interface PackagePrintLabel {
  orderNumber: string;
  customerName: string;
  address: string;
  district: string;
  contactNumber: string;
  alternativeContactNumber?: string | null;
  deliveryNotes?: string | null;
}

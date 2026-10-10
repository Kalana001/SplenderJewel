import type { SriLankaDistrict } from '@/lib/config/districts';

/**
 * Customer User Profile (matches public.profiles schema)
 */
export interface UserProfile {
  id: string; // References auth.users
  email: string;
  fullName: string;
  phone1?: string | null;
  phone2?: string | null;
  avatarUrl?: string | null;
  accountStatus: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

/**
 * Saved Customer Address (matches public.addresses schema)
 */
export interface UserAddress {
  id: string;
  userId: string;
  label?: string | null; // e.g. "Home", "Office"
  fullName: string;
  phone1: string;
  phone2?: string | null;
  addressLine: string;
  city?: string | null;
  district: SriLankaDistrict;
  province?: string | null;
  postalCode?: string | null;
  deliveryNotes?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin User Roles & Access (matches public.admin_users schema)
 */
export type AdminRole = 'super_admin' | 'admin' | 'staff';

export interface AdminUser {
  id: string; // References auth.users
  email: string;
  fullName: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin Audit Log Record (matches public.audit_logs schema)
 */
export interface AdminAuditLog {
  id: string;
  adminId?: string | null;
  adminEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

import type { SriLankaDistrict } from '@/lib/config/districts';

export interface CustomerAddress {
  id: string;
  userId: string;
  label?: string | null;
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

export interface AddressInput {
  label?: string;
  fullName: string;
  phone1: string;
  phone2?: string;
  addressLine: string;
  city?: string;
  district: string;
  province?: string;
  postalCode?: string;
  deliveryNotes?: string;
  isDefault?: boolean;
}

'use server';

import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCustomerAuth, getCurrentUser } from '@/lib/auth/server';
import { isValidDistrict, type SriLankaDistrict } from '@/lib/config/districts';
import { normalizePhoneNumber } from '@/lib/config/whatsapp';
import type { CustomerAddress, AddressInput } from '@/types/address';

function validateAddressData(input: AddressInput): { isValid: boolean; error?: string; normalized?: AddressInput } {
  const fullName = input.fullName?.trim();
  if (!fullName || fullName.length < 2) {
    return { isValid: false, error: 'Full name is required (minimum 2 characters).' };
  }

  const rawPhone1 = input.phone1?.trim();
  if (!rawPhone1) {
    return { isValid: false, error: 'Primary contact phone number is required.' };
  }
  const phone1 = normalizePhoneNumber(rawPhone1);
  if (!phone1 || phone1.length < 9) {
    return { isValid: false, error: 'Please enter a valid primary phone number.' };
  }

  let phone2: string | undefined = undefined;
  if (input.phone2 && input.phone2.trim()) {
    phone2 = normalizePhoneNumber(input.phone2.trim());
    if (phone2.length < 9) {
      return { isValid: false, error: 'Secondary phone number is invalid.' };
    }
  }

  const addressLine = input.addressLine?.trim();
  if (!addressLine || addressLine.length < 5) {
    return { isValid: false, error: 'Street address line is required (minimum 5 characters).' };
  }

  const district = input.district?.trim();
  if (!district || !isValidDistrict(district)) {
    return { isValid: false, error: 'Please select a valid Sri Lankan administrative district.' };
  }

  return {
    isValid: true,
    normalized: {
      label: input.label?.trim() || undefined,
      fullName,
      phone1,
      phone2,
      addressLine,
      city: input.city?.trim() || undefined,
      district,
      province: input.province?.trim() || undefined,
      postalCode: input.postalCode?.trim() || undefined,
      deliveryNotes: input.deliveryNotes?.trim() || undefined,
      isDefault: Boolean(input.isDefault),
    },
  };
}

export async function getCustomerAddresses(): Promise<{
  success: boolean;
  addresses: CustomerAddress[];
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, addresses: [], error: 'Database service is currently unavailable.' };
    }

    const { data, error } = await (supabase.from('addresses') as any)
      .select('*')
      .eq('user_id', profile.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, addresses: [], error: error.message };
    }

    const addresses: CustomerAddress[] = (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      label: row.label,
      fullName: row.full_name,
      phone1: row.phone1,
      phone2: row.phone2,
      addressLine: row.address_line,
      city: row.city,
      district: row.district as SriLankaDistrict,
      province: row.province,
      postalCode: row.postal_code,
      deliveryNotes: row.delivery_notes,
      isDefault: Boolean(row.is_default),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { success: true, addresses };
  } catch (err: any) {
    return {
      success: false,
      addresses: [],
      error: err.message === 'UNAUTHORIZED_CUSTOMER' ? 'Please log in to view your saved addresses.' : (err.message || 'Failed to retrieve addresses.'),
    };
  }
}

export async function createCustomerAddress(input: AddressInput): Promise<{
  success: boolean;
  address?: CustomerAddress;
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    const validation = validateAddressData(input);
    if (!validation.isValid || !validation.normalized) {
      return { success: false, error: validation.error };
    }
    const clean = validation.normalized;

    // Check count of existing addresses
    const { count } = await (supabase.from('addresses') as any)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id);

    const isFirstAddress = (count ?? 0) === 0;
    const shouldBeDefault = isFirstAddress || clean.isDefault;

    if (shouldBeDefault) {
      // Clear previous default
      await (supabase.from('addresses') as any)
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', profile.id);
    }

    const { data, error } = await (supabase.from('addresses') as any)
      .insert({
        user_id: profile.id,
        label: clean.label || null,
        full_name: clean.fullName,
        phone1: clean.phone1,
        phone2: clean.phone2 || null,
        address_line: clean.addressLine,
        city: clean.city || null,
        district: clean.district,
        province: clean.province || null,
        postal_code: clean.postalCode || null,
        delivery_notes: clean.deliveryNotes || null,
        is_default: shouldBeDefault,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      address: {
        id: data.id,
        userId: data.user_id,
        label: data.label,
        fullName: data.full_name,
        phone1: data.phone1,
        phone2: data.phone2,
        addressLine: data.address_line,
        city: data.city,
        district: data.district as SriLankaDistrict,
        province: data.province,
        postalCode: data.postal_code,
        deliveryNotes: data.delivery_notes,
        isDefault: Boolean(data.is_default),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save address.' };
  }
}

export async function updateCustomerAddress(
  id: string,
  input: AddressInput
): Promise<{
  success: boolean;
  address?: CustomerAddress;
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    const validation = validateAddressData(input);
    if (!validation.isValid || !validation.normalized) {
      return { success: false, error: validation.error };
    }
    const clean = validation.normalized;

    if (clean.isDefault) {
      await (supabase.from('addresses') as any)
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', profile.id);
    }

    const { data, error } = await (supabase.from('addresses') as any)
      .update({
        label: clean.label || null,
        full_name: clean.fullName,
        phone1: clean.phone1,
        phone2: clean.phone2 || null,
        address_line: clean.addressLine,
        city: clean.city || null,
        district: clean.district,
        province: clean.province || null,
        postal_code: clean.postalCode || null,
        delivery_notes: clean.deliveryNotes || null,
        is_default: clean.isDefault,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', profile.id)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      address: {
        id: data.id,
        userId: data.user_id,
        label: data.label,
        fullName: data.full_name,
        phone1: data.phone1,
        phone2: data.phone2,
        addressLine: data.address_line,
        city: data.city,
        district: data.district as SriLankaDistrict,
        province: data.province,
        postalCode: data.postal_code,
        deliveryNotes: data.delivery_notes,
        isDefault: Boolean(data.is_default),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update address.' };
  }
}

export async function deleteCustomerAddress(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    // Check if the address to delete is default
    const { data: target } = await (supabase.from('addresses') as any)
      .select('is_default')
      .eq('id', id)
      .eq('user_id', profile.id)
      .single();

    const { error } = await (supabase.from('addresses') as any)
      .delete()
      .eq('id', id)
      .eq('user_id', profile.id);

    if (error) {
      return { success: false, error: error.message };
    }

    // If deleted address was default, promote newest remaining address
    if (target?.is_default) {
      const { data: remaining } = await (supabase.from('addresses') as any)
        .select('id')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (remaining && remaining.length > 0) {
        await (supabase.from('addresses') as any)
          .update({ is_default: true, updated_at: new Date().toISOString() })
          .eq('id', remaining[0].id)
          .eq('user_id', profile.id);
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete address.' };
  }
}

export async function setDefaultCustomerAddress(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    await (supabase.from('addresses') as any)
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('user_id', profile.id);

    const { error } = await (supabase.from('addresses') as any)
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', profile.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to set default address.' };
  }
}

/**
 * Guest-safe server action to retrieve saved delivery addresses for the checkout flow.
 * - Validates session server-side via getCurrentUser().
 * - Never accepts client-supplied user IDs.
 * - Genuine unauthenticated guests return `{ isAuthenticated: false, addresses: [] }` without error.
 * - Authenticated customers receive their own saved addresses strictly scoped by `user_id = user.id`.
 * - Safely returns user.email to assist in checkout prefill.
 */
export async function getCheckoutSavedAddressesAction(): Promise<{
  isAuthenticated: boolean;
  addresses: CustomerAddress[];
  email?: string | null;
  error?: string;
}> {
  let user: { id: string; email?: string } | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Distinguish authentication service failures: do NOT silently classify as a normal guest
    return {
      isAuthenticated: false,
      addresses: [],
      error: 'Authentication service is temporarily unavailable.',
    };
  }

  // Genuine unauthenticated guest
  if (!user) {
    return { isAuthenticated: false, addresses: [] };
  }

  // Authenticated customer: retrieve saved addresses with safe error boundary
  try {
    const res = await getCustomerAddresses();
    if (!res.success) {
      return {
        isAuthenticated: true,
        addresses: [],
        email: user.email || null,
        error: 'Unable to retrieve saved addresses at this time.',
      };
    }

    return {
      isAuthenticated: true,
      addresses: res.addresses,
      email: user.email || null,
    };
  } catch {
    // Distinguish database/network errors: customer remains authenticated
    return {
      isAuthenticated: true,
      addresses: [],
      email: user.email || null,
      error: 'Unable to retrieve saved addresses at this time.',
    };
  }
}

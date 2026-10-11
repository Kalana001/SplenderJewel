'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getPasswordResetRedirectUrl } from '@/lib/auth/redirect';

export interface AuthActionResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Customer Sign Up (Email + Password only).
 * Automated database trigger creates the corresponding public.profiles record.
 */
export async function signUpCustomer(formData: {
  email: string;
  password: string;
  fullName: string;
  phone1?: string;
}): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  const { email, password, fullName, phone1 } = formData;

  if (!email || !password || !fullName) {
    return { success: false, error: 'Full name, email, and password are required.' };
  }

  if (password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone1: phone1 || null,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    message: data.session
      ? 'Account created successfully.'
      : 'Account created. Please check your email to confirm your account.',
  };
}

/**
 * Customer Sign In (Email + Password only).
 */
export async function signInCustomer(formData: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  const { email, password } = formData;

  if (!email || !password) {
    return { success: false, error: 'Email and password are required.' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * Customer Sign Out.
 */
export async function signOutCustomer(): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * Request Password Reset Email.
 */
export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  if (!email) {
    return { success: false, error: 'Email address is required.' };
  }

  const redirectTo = getPasswordResetRedirectUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    message: 'If an account exists with this email address, password reset instructions have been sent.',
  };
}

/**
 * Customer Password Update (requires active authenticated or recovery session).
 */
export async function updatePassword(newPassword: string): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/', 'layout');
  return {
    success: true,
    message: 'Your password has been updated successfully.',
  };
}

/**
 * Customer Profile Update (Safe fields only: fullName, phone1, phone2, avatarUrl).
 * Prevents tampering with accountStatus or user ID.
 */
export async function updateCustomerProfile(formData: {
  fullName?: string;
  phone1?: string;
  phone2?: string;
  avatarUrl?: string;
}): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized. Please sign in to update your profile.' };
  }

  const updatePayload: {
    full_name?: string;
    phone1?: string | null;
    phone2?: string | null;
    avatar_url?: string | null;
  } = {};

  if (formData.fullName !== undefined) updatePayload.full_name = formData.fullName.trim();
  if (formData.phone1 !== undefined) updatePayload.phone1 = formData.phone1.trim() || null;
  if (formData.phone2 !== undefined) updatePayload.phone2 = formData.phone2.trim() || null;
  if (formData.avatarUrl !== undefined) updatePayload.avatar_url = formData.avatarUrl.trim() || null;

  const { error } = await (supabase.from('profiles') as any)
    .update(updatePayload)
    .eq('id', user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/account/profile');
  return { success: true, message: 'Profile updated successfully.' };
}


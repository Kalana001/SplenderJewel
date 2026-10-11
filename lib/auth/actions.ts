'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { getPasswordResetRedirectUrl, getCanonicalSiteUrl } from '@/lib/auth/redirect';

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

  const emailRedirectTo = `${getCanonicalSiteUrl()}/auth/callback?next=/account`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
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

export interface AdminSignInResult extends AuthActionResult {
  role?: string;
  adminId?: string;
}

/**
 * Administrator Sign In.
 * Authenticates via Supabase Auth and strictly verifies active role in public.admin_users.
 * If user is not present in admin_users or is deactivated (is_active = false),
 * session is immediately terminated (signOut) and access is denied.
 */
export async function signInAdmin(formData: {
  email: string;
  password: string;
}): Promise<AdminSignInResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  const { email, password } = formData;

  if (!email || !password) {
    return { success: false, error: 'Email and password are required.' };
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (authError || !authData.user) {
    return { success: false, error: authError?.message || 'Invalid administrative credentials.' };
  }

  const userId = authData.user.id;

  // Verify administrative privileges strictly server-side
  let adminRecord: { id: string; email: string; role: string; is_active: boolean } | null = null;
  try {
    const adminClient = createAdminClient();
    const { data, error } = await (adminClient.from('admin_users') as any)
      .select('id, email, full_name, role, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      adminRecord = data;
    }
  } catch {
    // If admin client cannot be created, fallback to checking with authenticated client
    const { data } = await (supabase.from('admin_users') as any)
      .select('id, email, full_name, role, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      adminRecord = data;
    }
  }

  if (!adminRecord) {
    // Non-admin customer attempted admin login: invalidate session immediately
    await supabase.auth.signOut();
    return {
      success: false,
      error: 'Access Denied: This account is not registered as an authorized administrator.',
    };
  }

  if (!adminRecord.is_active) {
    // Inactive admin: invalidate session immediately
    await supabase.auth.signOut();
    return {
      success: false,
      error: 'Access Denied: Your administrator account has been deactivated. Please contact the store owner.',
    };
  }

  revalidatePath('/admin', 'layout');
  return {
    success: true,
    role: adminRecord.role,
    adminId: adminRecord.id,
  };
}

/**
 * Administrator Sign Out.
 */
export async function signOutAdmin(): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin', 'layout');
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


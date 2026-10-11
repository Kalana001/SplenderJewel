import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserProfile, AdminUser } from '@/types/auth';

/**
 * Returns the currently authenticated Supabase Auth user, or null if unauthenticated.
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Returns the customer profile for the currently authenticated user.
 */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone1, phone2, avatar_url, account_status, created_at, updated_at')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return null;
  }

  const profile = data as {
    id: string;
    email: string;
    full_name: string;
    phone1: string | null;
    phone2: string | null;
    avatar_url: string | null;
    account_status: 'active' | 'suspended';
    created_at: string;
    updated_at: string;
  };

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    phone1: profile.phone1,
    phone2: profile.phone2,
    avatarUrl: profile.avatar_url,
    accountStatus: profile.account_status,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

/**
 * Verifies if the currently authenticated user is an authorized active admin.
 * Evaluates the `public.admin_users` table server-side.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('admin_users')
    .select('id, email, full_name, role, is_active, created_at, updated_at')
    .eq('id', user.id)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  const adminRecord = data as {
    id: string;
    email: string;
    full_name: string;
    role: 'super_admin' | 'admin' | 'staff';
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  return {
    id: adminRecord.id,
    email: adminRecord.email,
    fullName: adminRecord.full_name,
    role: adminRecord.role,
    isActive: adminRecord.is_active,
    createdAt: adminRecord.created_at,
    updatedAt: adminRecord.updated_at,
  };
}

import { redirect } from 'next/navigation';

/**
 * Structured Admin Authorization Error distinguishing unauthenticated vs forbidden access.
 */
export class AdminAuthError extends Error {
  readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN';

  constructor(
    message = 'Unauthorized: Administrative credentials and active admin role are required.',
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' = 'FORBIDDEN'
  ) {
    super(message);
    this.name = 'AdminAuthError';
    this.code = code;
  }
}

/**
 * Throws or redirects if caller is not an authenticated customer.
 */
export async function requireCustomerAuth(): Promise<UserProfile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error('UNAUTHORIZED_CUSTOMER');
  }
  return profile;
}

/**
 * Throws a clean AdminAuthError if caller is not an authorized administrator.
 * Distinguishes unauthenticated from forbidden (inactive or non-admin customer).
 * Used by privileged server actions and mutations.
 */
export async function requireAdminAuth(): Promise<AdminUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AdminAuthError('Authentication required. Please sign in as an administrator.', 'UNAUTHENTICATED');
  }

  const admin = await getAdminUser();
  if (!admin) {
    throw new AdminAuthError('Forbidden: Active administrative privileges are required.', 'FORBIDDEN');
  }

  return admin;
}

/**
 * Server-side authorization guard for protected Admin pages (Server Components).
 * Evaluates `public.admin_users` table server-side.
 * Redirects unauthenticated users cleanly to `/admin/login`, and ordinary customers to `/admin/login?error=unauthorized`.
 * Prevents rendering of any protected admin UI or data.
 */
export async function requireAdminPageAuth(): Promise<AdminUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/admin/login');
  }

  const admin = await getAdminUser();
  if (!admin) {
    redirect('/admin/login?error=unauthorized');
  }

  return admin;
}

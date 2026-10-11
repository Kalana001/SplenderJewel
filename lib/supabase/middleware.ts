import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveRootAuthRedirect } from '@/lib/auth/redirect';

export { resolveRootAuthRedirect };

/**
 * Updates Supabase session tokens and enforces route protection.
 *
 * Route Protection Rules:
 * - Public routes: Unrestricted access (storefront, catalog, info pages, login, register).
 * - Customer routes (/account/*): Requires an authenticated user session. Redirects to /login.
 * - Admin routes (/admin/*): Requires an authenticated user who exists in public.admin_users.
 *   Excludes /admin/login. Redirects unauthorized users to /admin/login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // Intercept recovery callbacks or expired links that fall back to the root homepage
  if (pathname === '/') {
    const redirectUrl = resolveRootAuthRedirect(request.nextUrl.searchParams, request.url);
    if (redirectUrl) {
      return NextResponse.redirect(redirectUrl);
    }
  }

  const isCustomerProtected = pathname.startsWith('/account');
  const isAdminProtected = pathname.startsWith('/admin') && pathname !== '/admin/login';

  // Performance Optimization: Bypass Supabase Auth remote network call on public routes to eliminate 300ms-600ms latency on every public page click
  if (!isCustomerProtected && !isAdminProtected) {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh auth session only on protected routes
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Customer Protected Routes: /account/*
  if (isCustomerProtected) {
    if (!user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 2. Admin Protected Routes: /admin/* (excluding /admin/login)
  if (isAdminProtected) {
    if (!user) {
      const redirectUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(redirectUrl);
    }

    // Check if the user is registered as an active admin in public.admin_users
    const { data: adminRecord } = await supabase
      .from('admin_users')
      .select('id, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!adminRecord) {
      // Authenticated user is NOT an admin — redirect away from admin panel
      const redirectUrl = new URL('/admin/login', request.url);
      redirectUrl.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}

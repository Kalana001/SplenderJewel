import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // Refresh auth session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 1. Customer Protected Routes: /account/*
  if (pathname.startsWith('/account')) {
    if (!user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 2. Admin Protected Routes: /admin/* (excluding /admin/login)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
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

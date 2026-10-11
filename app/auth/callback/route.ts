import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSafeRedirectUrl } from '@/lib/auth/redirect';

/**
 * Authentication Callback Handler
 *
 * Handles PKCE exchange for email confirmations, password reset tokens,
 * and magic links. Validates and sanitizes the target redirect path to
 * prevent open-redirect vulnerabilities.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error_description') || searchParams.get('error');
  const next = searchParams.get('next') || searchParams.get('redirectTo');

  // Sanitize next destination URL
  const safeNext = getSafeRedirectUrl(next, '/account');

  // Handle OAuth or token errors passed directly by Supabase
  if (errorParam) {
    console.error('[Auth Callback Parameter Error]', errorParam);
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('error', errorParam);
    return NextResponse.redirect(redirectUrl);
  }

  // Handle PKCE code exchange
  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        console.error('[Auth Callback Code Exchange Error]', exchangeError.message);
        const redirectUrl = new URL('/login', request.url);
        redirectUrl.searchParams.set('error', exchangeError.message);
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return NextResponse.redirect(new URL(safeNext, request.url));
}

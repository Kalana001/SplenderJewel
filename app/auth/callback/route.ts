import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getSafeRedirectUrl } from '@/lib/auth/redirect';

/**
 * Authentication Callback Handler
 *
 * Handles PKCE exchange for email confirmations, password reset tokens,
 * and OTP verification. Preserves session cookies directly on the redirect response
 * and routes recovery errors cleanly to the reset-password interface.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const errorParam = searchParams.get('error_description') || searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const next = searchParams.get('next') || searchParams.get('redirectTo');

  const isRecovery = next === '/reset-password' || type === 'recovery';
  const defaultTarget = isRecovery ? '/reset-password' : '/account';
  const safeNext = getSafeRedirectUrl(next, defaultTarget);

  // 1. Handle error parameters passed directly by Supabase
  if (errorParam || errorCode) {
    console.error('[Auth Callback Parameter Error]', { errorCode, errorParam });
    if (isRecovery) {
      const errorRedirect = new URL('/reset-password', request.url);
      errorRedirect.searchParams.set(
        'error',
        errorCode === 'otp_expired' ? 'otp_expired' : (errorCode || errorParam || 'invalid_link')
      );
      return NextResponse.redirect(errorRedirect);
    }
    const errorRedirect = new URL('/login', request.url);
    errorRedirect.searchParams.set('error', errorParam || errorCode || 'Authentication failed');
    return NextResponse.redirect(errorRedirect);
  }

  // Pre-create the redirect response to capture auth session cookies
  const response = NextResponse.redirect(new URL(safeNext, request.url));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isRecovery) {
      const errorRedirect = new URL('/reset-password', request.url);
      errorRedirect.searchParams.set('error', 'service_unavailable');
      return NextResponse.redirect(errorRedirect);
    }
    return response;
  }

  // Create Supabase SSR client bound to the response cookie store
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // 2. Handle PKCE code exchange
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error('[Auth Callback Code Exchange Error]', exchangeError.message);
      if (isRecovery) {
        const errorRedirect = new URL('/reset-password', request.url);
        const codeMsg = exchangeError.message.toLowerCase();
        errorRedirect.searchParams.set(
          'error',
          codeMsg.includes('expired') ? 'otp_expired' : 'invalid_link'
        );
        return NextResponse.redirect(errorRedirect);
      }
      const errorRedirect = new URL('/login', request.url);
      errorRedirect.searchParams.set('error', exchangeError.message);
      return NextResponse.redirect(errorRedirect);
    }
  } else if (tokenHash && type) {
    // 3. Handle OTP / token_hash verification
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (verifyError) {
      console.error('[Auth Callback Verify OTP Error]', verifyError.message);
      if (isRecovery) {
        const errorRedirect = new URL('/reset-password', request.url);
        const verifyMsg = verifyError.message.toLowerCase();
        errorRedirect.searchParams.set(
          'error',
          verifyMsg.includes('expired') ? 'otp_expired' : 'invalid_link'
        );
        return NextResponse.redirect(errorRedirect);
      }
      const errorRedirect = new URL('/login', request.url);
      errorRedirect.searchParams.set('error', verifyError.message);
      return NextResponse.redirect(errorRedirect);
    }
  }

  return response;
}

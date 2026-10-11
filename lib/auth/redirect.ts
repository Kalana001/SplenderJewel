/**
 * Safe Internal Redirect Validation
 *
 * Prevents Open Redirect vulnerabilities by strictly enforcing that redirects:
 * 1. Must be relative paths starting with a single '/'
 * 2. Reject protocol-relative URLs (e.g. '//evil.com')
 * 3. Reject backslash-tricked paths (e.g. '/\\evil.com')
 * 4. Reject control characters and arbitrary protocols
 * 5. Default safely to '/account' if input is invalid or untrusted
 */
export function getSafeRedirectUrl(
  redirectTo?: string | null,
  defaultUrl: string = '/account'
): string {
  if (!redirectTo || typeof redirectTo !== 'string') {
    return defaultUrl;
  }

  const trimmed = redirectTo.trim();
  if (!trimmed) {
    return defaultUrl;
  }

  // Must begin with a single slash, and must NOT begin with '//' or '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return defaultUrl;
  }

  // Reject newlines, tabs, carriage returns (header injection prevention)
  if (/[\r\n\t]/.test(trimmed)) {
    return defaultUrl;
  }

  try {
    // Resolve against dummy local origin to verify hostname/origin cannot be manipulated
    const dummyOrigin = 'https://splender-jewel.internal';
    const parsed = new URL(trimmed, dummyOrigin);

    if (parsed.origin !== dummyOrigin) {
      return defaultUrl;
    }

    // Return the sanitized internal pathname + search query
    return parsed.pathname + parsed.search;
  } catch {
    return defaultUrl;
  }
}

/**
 * Canonical Site URL Resolution
 *
 * Resolves the absolute base URL of the application.
 * Guarantees that production redirects NEVER resolve to localhost.
 */
export function getCanonicalSiteUrl(): string {
  // Check explicit public site URL environment variable
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  // Determine if running in production mode
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production';

  if (envUrl) {
    const isLocal = envUrl.includes('localhost') || envUrl.includes('127.0.0.1');
    if (isProduction && isLocal) {
      // Reject localhost in production environment
      return 'https://splender-jewel.vercel.app';
    }
    return envUrl.replace(/\/+$/, '');
  }

  // Check Vercel production deployment URLs
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, '')}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;
  }

  // In production, fallback strictly to the verified production domain
  if (isProduction) {
    return 'https://splender-jewel.vercel.app';
  }

  // Safe development fallback
  return 'http://localhost:3000';
}

/**
 * Password Reset Callback URL
 *
 * Constructs the canonical URL for password-reset verification callbacks.
 * Guarantees the callback route and next destination are properly structured.
 */
export function getPasswordResetRedirectUrl(): string {
  const baseUrl = getCanonicalSiteUrl();
  return `${baseUrl}/auth/callback?next=/reset-password`;
}

/**
 * Resolves root homepage fallbacks for auth callbacks or expired recovery links.
 * Forwarding happens without token verification or session creation.
 */
export function resolveRootAuthRedirect(
  searchParams: URLSearchParams,
  baseUrl: string = 'http://localhost:3000'
): URL | null {
  const errorCode = searchParams.get('error_code');
  const errorParam = searchParams.get('error_description') || searchParams.get('error');

  if (errorCode === 'otp_expired' || (errorParam && errorParam.toLowerCase().includes('expired'))) {
    const redirectUrl = new URL('/forgot-password', baseUrl);
    redirectUrl.searchParams.set('error', 'otp_expired');
    return redirectUrl;
  }

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const rawNext = searchParams.get('next');

  if (code || tokenHash) {
    const redirectUrl = new URL('/auth/callback', baseUrl);

    if (code) {
      redirectUrl.searchParams.set('code', code);
    } else if (tokenHash) {
      redirectUrl.searchParams.set('token_hash', tokenHash);
    }

    if (type) {
      redirectUrl.searchParams.set('type', type);
    }

    const defaultNext = type === 'recovery' ? '/reset-password' : '/account';
    if (rawNext) {
      redirectUrl.searchParams.set('next', getSafeRedirectUrl(rawNext, defaultNext));
    } else if (type === 'recovery') {
      redirectUrl.searchParams.set('next', '/reset-password');
    }

    return redirectUrl;
  }

  return null;
}

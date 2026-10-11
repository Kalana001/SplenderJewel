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

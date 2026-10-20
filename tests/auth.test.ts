import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { getSafeRedirectUrl, getCanonicalSiteUrl, getPasswordResetRedirectUrl } from '../lib/auth/redirect.ts';

const WORKSPACE_DIR = process.cwd();

const origEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...origEnv };
});

test('getSafeRedirectUrl - allows safe internal relative paths', () => {
  assert.equal(getSafeRedirectUrl('/account'), '/account');
  assert.equal(getSafeRedirectUrl('/checkout'), '/checkout');
  assert.equal(getSafeRedirectUrl('/reset-password'), '/reset-password');
  assert.equal(getSafeRedirectUrl('/account/orders'), '/account/orders');
  assert.equal(getSafeRedirectUrl('/account/orders/123?filter=active'), '/account/orders/123?filter=active');
  assert.equal(getSafeRedirectUrl('/shop'), '/shop');
});

test('getSafeRedirectUrl - falls back safely on empty or null values', () => {
  assert.equal(getSafeRedirectUrl(null), '/account');
  assert.equal(getSafeRedirectUrl(undefined), '/account');
  assert.equal(getSafeRedirectUrl(''), '/account');
  assert.equal(getSafeRedirectUrl('   '), '/account');
  assert.equal(getSafeRedirectUrl(null, '/checkout'), '/checkout');
  assert.equal(getSafeRedirectUrl(null, '/reset-password'), '/reset-password');
});

test('getSafeRedirectUrl - blocks open redirect attacks with external schemes', () => {
  assert.equal(getSafeRedirectUrl('https://malicious-site.com'), '/account');
  assert.equal(getSafeRedirectUrl('http://malicious-site.com'), '/account');
  assert.equal(getSafeRedirectUrl('ftp://malicious-site.com'), '/account');
  assert.equal(getSafeRedirectUrl('javascript:alert(1)'), '/account');
  assert.equal(getSafeRedirectUrl('data:text/html,<html>'), '/account');
});

test('getSafeRedirectUrl - blocks protocol-relative URLs', () => {
  assert.equal(getSafeRedirectUrl('//malicious-site.com'), '/account');
  assert.equal(getSafeRedirectUrl('//malicious-site.com/path'), '/account');
  assert.equal(getSafeRedirectUrl('///malicious-site.com'), '/account');
});

test('getSafeRedirectUrl - blocks backslash-based bypass tricks', () => {
  assert.equal(getSafeRedirectUrl('/\\malicious-site.com'), '/account');
  assert.equal(getSafeRedirectUrl('\\malicious-site.com'), '/account');
});

test('getSafeRedirectUrl - blocks CRLF header injection characters', () => {
  assert.equal(getSafeRedirectUrl('/account\r\nSet-Cookie:admin=1'), '/account');
  assert.equal(getSafeRedirectUrl('/account\nlocation:evil.com'), '/account');
  assert.equal(getSafeRedirectUrl('/account\tevil'), '/account');
});

test('getCanonicalSiteUrl - strictly rejects localhost in production and uses canonical domain', () => {
  (process.env as any).NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;

  assert.equal(getCanonicalSiteUrl(), 'https://splender-jewel.vercel.app');
});

test('getCanonicalSiteUrl - trims trailing slashes from valid public site URL', () => {
  (process.env as any).NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://splender-jewel.vercel.app///';

  assert.equal(getCanonicalSiteUrl(), 'https://splender-jewel.vercel.app');
});

test('getCanonicalSiteUrl - uses VERCEL_PROJECT_PRODUCTION_URL when NEXT_PUBLIC_SITE_URL is unset', () => {
  (process.env as any).NODE_ENV = 'production';
  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'splender-jewel.vercel.app';

  assert.equal(getCanonicalSiteUrl(), 'https://splender-jewel.vercel.app');
});

test('getCanonicalSiteUrl - falls back to production domain if no env var is configured in production', () => {
  (process.env as any).NODE_ENV = 'production';
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;

  assert.equal(getCanonicalSiteUrl(), 'https://splender-jewel.vercel.app');
});

test('getCanonicalSiteUrl - permits localhost in development environment', () => {
  (process.env as any).NODE_ENV = 'development';
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

  assert.equal(getCanonicalSiteUrl(), 'http://localhost:3000');
});

test('getPasswordResetRedirectUrl - constructs canonical production callback URL', () => {
  (process.env as any).NODE_ENV = 'production';
  delete process.env.NEXT_PUBLIC_SITE_URL;

  const resetUrl = getPasswordResetRedirectUrl();
  assert.equal(resetUrl, 'https://splender-jewel.vercel.app/auth/callback?next=/reset-password');
  assert.equal(resetUrl.includes('localhost'), false);
});

// =============================================================================
// LOGIN DEFAULT REDIRECT & SAFE REDIRECT VALIDATION REGRESSION TESTS
// =============================================================================

test('Login Form: safeTargetUrl defaults to homepage ("/") when no redirectTo is provided', () => {
  const loginPath = join(WORKSPACE_DIR, 'app/(store)/login/page.tsx');
  const loginContent = readFileSync(loginPath, 'utf-8');

  // Must ensure safeTargetUrl defaults to '/'
  assert.match(
    loginContent,
    /const\s+safeTargetUrl\s*=\s*getSafeRedirectUrl\(redirectTo,\s*['"]\/['"]\);/,
    'LoginForm must use getSafeRedirectUrl(redirectTo, "/") to default to homepage'
  );

  // Must NOT default to /account
  assert.doesNotMatch(
    loginContent,
    /getSafeRedirectUrl\(redirectTo,\s*['"]\/account['"]\)/,
    'LoginForm must NOT default to /account'
  );
});

test('Customer Login Redirection: normal login without redirectTo redirects to homepage ("/")', () => {
  assert.equal(getSafeRedirectUrl(null, '/'), '/');
  assert.equal(getSafeRedirectUrl(undefined, '/'), '/');
  assert.equal(getSafeRedirectUrl('', '/'), '/');
  assert.equal(getSafeRedirectUrl('   ', '/'), '/');
});

test('Customer Login Redirection: preserves valid explicit redirectTo destinations', () => {
  // Account dashboard and sub-routes
  assert.equal(getSafeRedirectUrl('/account', '/'), '/account');
  assert.equal(getSafeRedirectUrl('/account/orders', '/'), '/account/orders');
  assert.equal(getSafeRedirectUrl('/account/addresses', '/'), '/account/addresses');
  assert.equal(getSafeRedirectUrl('/account/profile', '/'), '/account/profile');
  assert.equal(getSafeRedirectUrl('/account/wishlist', '/'), '/account/wishlist');

  // Checkout and catalog routes
  assert.equal(getSafeRedirectUrl('/checkout', '/'), '/checkout');
  assert.equal(getSafeRedirectUrl('/shop', '/'), '/shop');
  assert.equal(getSafeRedirectUrl('/category/rings', '/'), '/category/rings');
  assert.equal(getSafeRedirectUrl('/products/royal-solitaire?ref=email', '/'), '/products/royal-solitaire?ref=email');
});

test('Customer Login Redirection: rejects malicious redirects and falls back to homepage ("/")', () => {
  // External absolute URLs
  assert.equal(getSafeRedirectUrl('https://evil.com', '/'), '/');
  assert.equal(getSafeRedirectUrl('http://attacker.com/steal', '/'), '/');
  assert.equal(getSafeRedirectUrl('ftp://evil.com', '/'), '/');

  // Protocol-relative URLs
  assert.equal(getSafeRedirectUrl('//evil.com', '/'), '/');
  assert.equal(getSafeRedirectUrl('//evil.com/login', '/'), '/');
  assert.equal(getSafeRedirectUrl('///evil.com', '/'), '/');

  // Backslash bypass tricks
  assert.equal(getSafeRedirectUrl('/\\evil.com', '/'), '/');
  assert.equal(getSafeRedirectUrl('\\evil.com', '/'), '/');

  // Header injection characters
  assert.equal(getSafeRedirectUrl('/account\r\nSet-Cookie:malicious=1', '/'), '/');
  assert.equal(getSafeRedirectUrl('/account\nlocation:evil.com', '/'), '/');
  assert.equal(getSafeRedirectUrl('/account\tevil', '/'), '/');

  // Arbitrary schemes / script execution
  assert.equal(getSafeRedirectUrl('javascript:alert(document.cookie)', '/'), '/');
  assert.equal(getSafeRedirectUrl('data:text/html,<html>', '/'), '/');
});

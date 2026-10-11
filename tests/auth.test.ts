import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeRedirectUrl, getCanonicalSiteUrl, getPasswordResetRedirectUrl } from '../lib/auth/redirect.ts';

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

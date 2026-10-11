import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeRedirectUrl } from '../lib/auth/redirect.ts';

test('getSafeRedirectUrl - allows safe internal relative paths', () => {
  assert.equal(getSafeRedirectUrl('/account'), '/account');
  assert.equal(getSafeRedirectUrl('/checkout'), '/checkout');
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

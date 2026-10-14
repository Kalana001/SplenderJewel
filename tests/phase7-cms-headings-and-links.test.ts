import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  CANONICAL_PAGE_TITLES,
  KNOWN_EQUIVALENTS,
  isRedundantInitialHeading,
  normalizeTitleForComparison,
  renderInlineContent,
} from '../lib/cms/headings.ts';
import { DEFAULT_CONTENT_PAGES } from '../lib/cms/defaults.ts';
import { DEFAULT_DEV_STORE_CONFIG, getInstagramLink } from '../lib/config/store.ts';

// =============================================================================
// 1. CANONICAL TITLES FOR ALL 6 CMS INFORMATION PAGES
// =============================================================================

test('CMS Headings - Task 2 & 6: Canonical page titles for all 6 informational routes', () => {
  assert.equal(CANONICAL_PAGE_TITLES.about, 'About Splender Jewel');
  assert.equal(CANONICAL_PAGE_TITLES.faq, 'Frequently Asked Questions');
  assert.equal(CANONICAL_PAGE_TITLES.returns, 'Returns & Exchanges');
  assert.equal(CANONICAL_PAGE_TITLES.privacy, 'Privacy Policy');
  assert.equal(CANONICAL_PAGE_TITLES.terms, 'Terms & Conditions');
  assert.equal(CANONICAL_PAGE_TITLES.contact, 'Contact Us');
});

test('CMS Headings - Task 6: DEFAULT_CONTENT_PAGES titles use approved canonical titles', () => {
  const about = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'about');
  const faq = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'faq');
  const returns = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'returns');
  const privacy = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'privacy');
  const terms = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'terms');
  const contact = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'contact');

  assert.equal(about?.title, 'About Splender Jewel');
  assert.equal(faq?.title, 'Frequently Asked Questions');
  assert.equal(returns?.title, 'Returns & Exchanges');
  assert.equal(privacy?.title, 'Privacy Policy');
  assert.equal(terms?.title, 'Terms & Conditions');
  assert.equal(contact?.title, 'Contact Us');
});

// =============================================================================
// 2. REDUNDANT INITIAL HEADING SUPPRESSION LOGIC
// =============================================================================

test('CMS Headings - Task 4: FAQ introductory title is detected as redundant and suppressed', () => {
  // Common variants in defaults and DB
  assert.equal(
    isRedundantInitialHeading('# Customer Inquiries & FAQ', 'faq', 'Frequently Asked Questions', 'Frequently Asked Questions'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Frequently Asked Questions', 'faq', 'Frequently Asked Questions', 'Frequently Asked Questions'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('## FAQ', 'faq', 'Frequently Asked Questions', 'Frequently Asked Questions'),
    true
  );
  // Meaningful section headings inside FAQ are NOT redundant
  assert.equal(
    isRedundantInitialHeading('### 1. What is Splender Jewel?', 'faq', 'Frequently Asked Questions', 'Frequently Asked Questions'),
    false
  );
  assert.equal(
    isRedundantInitialHeading('### 10. Do you accept returns or exchanges?', 'faq', 'Frequently Asked Questions', 'Frequently Asked Questions'),
    false
  );
});

test('CMS Headings - Task 4: Returns & Exchanges introductory title is detected as redundant and suppressed', () => {
  assert.equal(
    isRedundantInitialHeading('# Returns & Exchanges', 'returns', 'Returns & Exchanges', 'Returns & Exchanges'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Returns and Exchanges', 'returns', 'Returns & Exchanges', 'Returns & Exchanges'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Returns and Exchange Policy', 'returns', 'Returns & Exchanges', 'Returns & Exchange Policy'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Returns & Exchange Policy', 'returns', 'Returns & Exchanges', 'Returns & Exchange Policy'),
    true
  );
  // Meaningful section heading inside returns is NOT redundant
  assert.equal(
    isRedundantInitialHeading('### How to Reach Us', 'returns', 'Returns & Exchanges', 'Returns & Exchanges'),
    false
  );
});

test('CMS Headings - Task 4: Terms & Conditions introductory title is detected as redundant and suppressed', () => {
  assert.equal(
    isRedundantInitialHeading('# Terms & Conditions', 'terms', 'Terms & Conditions', 'Terms & Conditions'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Terms and Conditions', 'terms', 'Terms & Conditions', 'Terms & Conditions'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Terms of Service', 'terms', 'Terms & Conditions', 'Terms of Service'),
    true
  );
  // Meaningful section heading inside terms is NOT redundant
  assert.equal(
    isRedundantInitialHeading('### 1. About Splender Jewel & Products', 'terms', 'Terms & Conditions', 'Terms & Conditions'),
    false
  );
  assert.equal(
    isRedundantInitialHeading('### 11. Product Care', 'terms', 'Terms & Conditions', 'Terms & Conditions'),
    false
  );
});

test('CMS Headings - Task 4: Privacy Policy introductory title is detected as redundant and suppressed', () => {
  assert.equal(
    isRedundantInitialHeading('# Privacy Policy', 'privacy', 'Privacy Policy', 'Privacy Policy'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Splender Jewel Privacy Policy', 'privacy', 'Privacy Policy', 'Privacy Policy'),
    true
  );
  // Meaningful section heading inside privacy is NOT redundant
  assert.equal(
    isRedundantInitialHeading('### Personal Information We Collect', 'privacy', 'Privacy Policy', 'Privacy Policy'),
    false
  );
  assert.equal(
    isRedundantInitialHeading('### Payment Information', 'privacy', 'Privacy Policy', 'Privacy Policy'),
    false
  );
});

test('CMS Headings - Task 4: About Splender Jewel introductory title is detected as redundant and suppressed', () => {
  assert.equal(
    isRedundantInitialHeading('# About Splender Jewel', 'about', 'About Splender Jewel', 'About Splender Jewel'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# About Us', 'about', 'About Splender Jewel', 'About Splender Jewel'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Our Heritage & Distinction', 'about', 'About Splender Jewel', 'About Splender Jewel'),
    true
  );
  // Meaningful section heading is NOT redundant
  assert.equal(
    isRedundantInitialHeading('### The Art of Refinement', 'about', 'About Splender Jewel', 'About Splender Jewel'),
    false
  );
});

test('CMS Headings - Task 4: Contact Us introductory title is detected as redundant and suppressed', () => {
  assert.equal(
    isRedundantInitialHeading('# Contact Us', 'contact', 'Contact Us', 'Contact Us'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Contact Splender Jewel', 'contact', 'Contact Us', 'Contact Splender Jewel'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('# Get in Touch with Splender Jewel', 'contact', 'Contact Us', 'Contact Us'),
    true
  );
  assert.equal(
    isRedundantInitialHeading('### Official Channels', 'contact', 'Contact Us', 'Contact Us'),
    false
  );
});

test('CMS Headings - Task 4: Broad substring matching is avoided to protect meaningful content headings', () => {
  // A heading like "About Our Gemstones" should NOT be suppressed just because it contains "about"
  assert.equal(
    isRedundantInitialHeading('# About Our Gemstones', 'about', 'About Splender Jewel', 'About Splender Jewel'),
    false
  );
  // A heading like "Terms of Promotional Vouchers" should NOT be suppressed
  assert.equal(
    isRedundantInitialHeading('# Terms of Promotional Vouchers', 'terms', 'Terms & Conditions', 'Terms & Conditions'),
    false
  );
  // A heading like "Frequently Inquired Jewelry Materials" should NOT be suppressed
  assert.equal(
    isRedundantInitialHeading('# Frequently Inquired Jewelry Materials', 'faq', 'Frequently Asked Questions', 'Frequently Asked Questions'),
    false
  );
});

// =============================================================================
// 3. INLINE CONTENT & INSTAGRAM LINK PARSING
// =============================================================================

test('CMS Headings - Task 7: Standalone Instagram URL is converted to clickable link with secure attributes', () => {
  const nodes = renderInlineContent('Instagram: https://www.instagram.com/splender_jewel/');
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0], 'Instagram: ');

  const anchor = nodes[1] as React.ReactElement;
  assert.ok(React.isValidElement(anchor));
  assert.equal(anchor.type, 'a');
  const anchorProps = (anchor as any).props;
  assert.equal(anchorProps.href, 'https://www.instagram.com/splender_jewel/');
  assert.equal(anchorProps.target, '_blank');
  assert.equal(anchorProps.rel, 'noopener noreferrer');
  assert.match(anchorProps.className, /text-luxury-gold/);
});

test('CMS Headings - Task 7: Outdated Instagram URL with query parameters is canonicalized', () => {
  const nodes = renderInlineContent('Follow us at https://www.instagram.com/splender_jewel?igsh=test123abc.');
  const linkFragment = nodes[1] as React.ReactElement;
  assert.ok(React.isValidElement(linkFragment));
  const anchor = (linkFragment as any).props.children[0];
  const anchorProps = (anchor as any).props;
  assert.equal(anchorProps.href, 'https://www.instagram.com/splender_jewel/');
  assert.equal(anchorProps.target, '_blank');
  assert.equal(anchorProps.rel, 'noopener noreferrer');

  // Trailing punctuation '.' is preserved outside the link
  const punct = (linkFragment as any).props.children[1];
  assert.equal(punct, '.');
});

test('CMS Headings - Task 7: Markdown format link [text](url) preserves security attributes', () => {
  const nodes = renderInlineContent('Official link: [Instagram Profile](https://www.instagram.com/splender_jewel/)');
  const anchor = nodes[1] as React.ReactElement;
  assert.ok(React.isValidElement(anchor));
  assert.equal(anchor.type, 'a');
  const anchorProps = (anchor as any).props;
  assert.equal(anchorProps.href, 'https://www.instagram.com/splender_jewel/');
  assert.equal(anchorProps.target, '_blank');
  assert.equal(anchorProps.rel, 'noopener noreferrer');
  assert.equal(anchorProps.children, 'Instagram Profile');
});

test('CMS Headings - Task 7: Arbitrary text without URLs is never turned into links', () => {
  const nodes = renderInlineContent('Our Instagram community loves timeless style.');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0], 'Our Instagram community loves timeless style.');
});

test('CMS Headings - Task 7: Storewide canonical Instagram link is active', () => {
  const link = getInstagramLink(DEFAULT_DEV_STORE_CONFIG);
  assert.equal(link, 'https://www.instagram.com/splender_jewel/');
});

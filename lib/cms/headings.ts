import React from 'react';

/**
 * Canonical display titles for official Splender Jewel information pages.
 * Guarantees consistent visible titles across pages regardless of legacy database state.
 */
export const CANONICAL_PAGE_TITLES: Record<string, string> = {
  about: 'About Splender Jewel',
  faq: 'Frequently Asked Questions',
  returns: 'Returns & Exchanges',
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
  contact: 'Contact Us',
};

/**
 * Known equivalent introductory titles for each page slug that should be suppressed
 * when appearing as an initial redundant page-level heading in Markdown content.
 */
export const KNOWN_EQUIVALENTS: Record<string, string[]> = {
  about: [
    'about splender jewel',
    'about us',
    'about',
    'about splender',
    'our heritage and distinction',
    'our heritage & distinction',
    'our story',
  ],
  faq: [
    'frequently asked questions',
    'customer inquiries and faq',
    'customer inquiries & faq',
    'faq',
    'faqs',
    'customer inquiries',
    'inquiries and faq',
    'frequently asked questions (faq)',
    'questions and answers',
  ],
  returns: [
    'returns and exchanges',
    'returns & exchanges',
    'returns and exchange policy',
    'returns & exchange policy',
    'return and exchange policy',
    'returns policy',
    'return policy',
    'returns',
  ],
  privacy: [
    'privacy policy',
    'privacy statement',
    'privacy',
    'privacy and data protection',
  ],
  terms: [
    'terms and conditions',
    'terms & conditions',
    'terms of service',
    'terms of use',
    'terms',
    'terms and conditions of service',
    'terms and conditions of sale',
  ],
  contact: [
    'contact us',
    'contact splender jewel',
    'get in touch with splender jewel',
    'get in touch',
    'contact',
  ],
};

/**
 * Strips Markdown heading symbols (#, ##, ###) and bold formatting markers (**).
 */
export function cleanHeadingText(text: string): string {
  return text.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
}

/**
 * Normalizes title text for resilient, non-fragile equality comparisons:
 * converts to lowercase, standardizes ampersands, collapses punctuation & whitespace.
 */
export function normalizeTitleForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/[#\-_—:•|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determines whether a given Markdown heading is an initial redundant page-level heading
 * that mirrors the page title or represents a known equivalent introductory title.
 */
export function isRedundantInitialHeading(
  rawHeading: string,
  slug?: string,
  displayTitle?: string,
  pageTitle?: string
): boolean {
  const text = cleanHeadingText(rawHeading);
  const normalizedHeading = normalizeTitleForComparison(text);

  if (displayTitle) {
    const normDisplay = normalizeTitleForComparison(displayTitle);
    if (normalizedHeading === normDisplay) return true;
    const hNoBrand = normalizedHeading.replace(/splender jewel/g, '').trim();
    const dNoBrand = normDisplay.replace(/splender jewel/g, '').trim();
    if (hNoBrand && hNoBrand === dNoBrand) return true;
  }

  if (pageTitle) {
    const normPage = normalizeTitleForComparison(pageTitle);
    if (normalizedHeading === normPage) return true;
    const hNoBrand = normalizedHeading.replace(/splender jewel/g, '').trim();
    const pNoBrand = normPage.replace(/splender jewel/g, '').trim();
    if (hNoBrand && hNoBrand === pNoBrand) return true;
  }

  if (slug) {
    const key = slug.toLowerCase().trim();
    const equivalents = KNOWN_EQUIVALENTS[key];
    if (equivalents) {
      for (const eq of equivalents) {
        if (normalizedHeading === normalizeTitleForComparison(eq)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Validates that a hyperlink URL uses safe, authorized protocols.
 * Prevents javascript:, data:, and relative protocol injections.
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    (trimmed.startsWith('/') && !trimmed.startsWith('//'))
  );
}

/**
 * Parses inline formatting for bold (**text**), Markdown hyperlinks ([text](url)),
 * and standalone URLs (e.g. https://www.instagram.com/splender_jewel/).
 * Ensures external links open in a new tab with rel="noopener noreferrer" and gold styling.
 */
export function renderInlineContent(text: string): React.ReactNode[] {
  // Tokenize Markdown links [text](url), bold **text**, and explicit URLs, filtering empty segments
  const tokens = text
    .split(/(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|https?:\/\/[^\s<]+)/g)
    .filter((t) => t.length > 0);

  return tokens.map((token, idx) => {
    // 1. Link matching: [label](url)
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      let [, label, url] = linkMatch;
      // Canonicalize Splender Jewel Instagram links
      if (url.includes('instagram.com/splender_jewel')) {
        url = 'https://www.instagram.com/splender_jewel/';
      }
      if (isSafeUrl(url)) {
        const isExternal = url.startsWith('http://') || url.startsWith('https://');
        return React.createElement(
          'a',
          {
            key: idx,
            href: url,
            target: isExternal ? '_blank' : undefined,
            rel: isExternal ? 'noopener noreferrer' : undefined,
            className: 'text-luxury-gold underline hover:text-luxury-gold-light transition-colors font-medium',
          },
          label
        );
      }
      return label;
    }

    // 2. Bold matching: **text**
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      return React.createElement(
        'strong',
        {
          key: idx,
          className: 'font-semibold text-white',
        },
        token.slice(2, -2)
      );
    }

    // 3. Raw URL matching: https?://...
    if (/^https?:\/\/[^\s<]+$/.test(token)) {
      let cleanUrl = token;
      let trailingPunct = '';
      const punctMatch = cleanUrl.match(/[.,;)]+$/);
      if (punctMatch) {
        trailingPunct = punctMatch[0];
        cleanUrl = cleanUrl.slice(0, -trailingPunct.length);
      }

      if (cleanUrl.includes('instagram.com/splender_jewel')) {
        cleanUrl = 'https://www.instagram.com/splender_jewel/';
      }

      if (isSafeUrl(cleanUrl)) {
        const anchor = React.createElement(
          'a',
          {
            key: `link-${idx}`,
            href: cleanUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-luxury-gold underline hover:text-luxury-gold-light transition-colors font-medium break-all',
          },
          cleanUrl
        );

        return trailingPunct
          ? React.createElement(React.Fragment, { key: idx }, anchor, trailingPunct)
          : anchor;
      }
      return token;
    }

    // 4. Regular text
    return token;
  });
}

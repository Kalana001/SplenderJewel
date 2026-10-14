import React from 'react';
import { Container } from '@/components/ui/container';
import type { ContentPage } from '@/types/cms';
import {
  CANONICAL_PAGE_TITLES,
  isRedundantInitialHeading,
  renderInlineContent,
} from '@/lib/cms/headings';

interface ContentPageViewerProps {
  page: ContentPage;
}

export function ContentPageViewer({ page }: ContentPageViewerProps) {
  const normalizedSlug = page.slug?.toLowerCase().trim();
  const displayTitle = (normalizedSlug && CANONICAL_PAGE_TITLES[normalizedSlug]) || page.title;

  // Safe markdown parser: suppresses duplicate initial page title, avoids excessive spacing,
  // demotes remaining H1s to H2 to preserve single-H1 accessibility, and formats links
  const renderFormattedContent = (rawText: string) => {
    const lines = rawText.split('\n');

    // Find the first non-empty line
    let firstNonEmptyIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== '') {
        firstNonEmptyIdx = i;
        break;
      }
    }

    // Check if the initial heading is redundant with the page title or known equivalents
    let initialSuppressedIdx = -1;
    if (firstNonEmptyIdx !== -1) {
      const firstLine = lines[firstNonEmptyIdx].trim();
      if (firstLine.startsWith('#')) {
        if (isRedundantInitialHeading(firstLine, page.slug, displayTitle, page.title)) {
          initialSuppressedIdx = firstNonEmptyIdx;
        }
      }
    }

    let skipImmediateBlanks = initialSuppressedIdx !== -1;

    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Suppress initial redundant heading
      if (idx === initialSuppressedIdx) {
        return null;
      }

      // Skip empty lines immediately following the suppressed heading to avoid excessive vertical gap
      if (skipImmediateBlanks && idx > initialSuppressedIdx) {
        if (!trimmed) {
          return null;
        }
        skipImmediateBlanks = false;
      }

      if (!trimmed) {
        return <div key={idx} className="h-3" />;
      }

      // Heading 1 (# ): Demoted to H2 so the page has exactly one H1
      if (trimmed.startsWith('# ')) {
        return (
          <h2 key={idx} className="font-serif font-bold text-xl sm:text-2xl text-white tracking-wide pt-4 pb-1 border-b border-neutral-850">
            {renderInlineContent(trimmed.replace(/^#\s+/, ''))}
          </h2>
        );
      }

      // Heading 2 (## )
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={idx} className="font-serif font-bold text-xl sm:text-2xl text-white tracking-wide pt-4 pb-1 border-b border-neutral-850">
            {renderInlineContent(trimmed.replace(/^##\s+/, ''))}
          </h2>
        );
      }

      // Heading 3 (### )
      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={idx} className="font-serif font-bold text-lg text-luxury-gold pt-3 pb-1">
            {renderInlineContent(trimmed.replace(/^###\s+/, ''))}
          </h3>
        );
      }

      // Bullet lists (- )
      if (trimmed.startsWith('- ')) {
        return (
          <li key={idx} className="text-xs sm:text-sm text-neutral-300 ml-5 list-disc leading-relaxed">
            {renderInlineContent(trimmed.replace(/^- \s*/, ''))}
          </li>
        );
      }

      // Paragraph
      return (
        <p key={idx} className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-light">
          {renderInlineContent(trimmed)}
        </p>
      );
    });
  };

  return (
    <Container size="lg" className="py-12 sm:py-16 md:py-20">
      <div className="max-w-3xl mx-auto space-y-6 bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-6 sm:p-10 shadow-xl">
        <div className="border-b border-neutral-800 pb-4">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-luxury-gold">
            Splender Jewel • Official Information
          </span>
          <h1 className="text-2xl sm:text-4xl font-serif font-bold text-white tracking-wide mt-1">
            {displayTitle}
          </h1>
        </div>

        <div className="space-y-3 pt-2">
          {renderFormattedContent(page.content)}
        </div>
      </div>
    </Container>
  );
}

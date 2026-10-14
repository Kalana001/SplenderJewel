import React from 'react';
import { Container } from '@/components/ui/container';
import type { ContentPage } from '@/types/cms';

interface ContentPageViewerProps {
  page: ContentPage;
}

/**
 * Validates that a hyperlink URL uses safe, authorized protocols.
 * Prevents javascript:, data:, and relative protocol injections.
 */
function isSafeUrl(url: string): boolean {
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
 * Parses inline formatting for bold (**text**) and Markdown hyperlinks ([text](url)).
 */
function renderInlineContent(text: string): React.ReactNode[] {
  // Tokenize Markdown links [text](url) and bold **text**
  const tokens = text.split(/(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*)/g);

  return tokens.map((token, idx) => {
    // 1. Link matching: [label](url)
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      if (isSafeUrl(url)) {
        const isExternal = url.startsWith('http://') || url.startsWith('https://');
        return (
          <a
            key={idx}
            href={url}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="text-luxury-gold underline hover:text-luxury-gold-light transition-colors font-medium"
          >
            {label}
          </a>
        );
      }
      return label;
    }

    // 2. Bold matching: **text**
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }

    // 3. Regular text
    return token;
  });
}

export function ContentPageViewer({ page }: ContentPageViewerProps) {
  // Safe, clean markdown parser handling headings (#, ##, ###), lists (-), and inline formatting
  const renderFormattedContent = (rawText: string) => {
    const lines = rawText.split('\n');

    return lines.map((line, idx) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return <div key={idx} className="h-3" />;
      }

      // Heading 1 (# )
      if (trimmed.startsWith('# ')) {
        return (
          <h1 key={idx} className="font-serif font-bold text-2xl sm:text-3xl text-white tracking-wide pt-4 pb-2 border-b border-neutral-800">
            {trimmed.replace('# ', '')}
          </h1>
        );
      }

      // Heading 2 (## )
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={idx} className="font-serif font-bold text-xl sm:text-2xl text-white tracking-wide pt-4 pb-1 border-b border-neutral-850">
            {renderInlineContent(trimmed.replace('## ', ''))}
          </h2>
        );
      }

      // Heading 3 (### )
      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={idx} className="font-serif font-bold text-lg text-luxury-gold pt-3 pb-1">
            {renderInlineContent(trimmed.replace('### ', ''))}
          </h3>
        );
      }

      // Bullet lists (- )
      if (trimmed.startsWith('- ')) {
        return (
          <li key={idx} className="text-xs sm:text-sm text-neutral-300 ml-5 list-disc leading-relaxed">
            {renderInlineContent(trimmed.replace('- ', ''))}
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
            {page.title}
          </h1>
        </div>

        <div className="space-y-3 pt-2">
          {renderFormattedContent(page.content)}
        </div>
      </div>
    </Container>
  );
}

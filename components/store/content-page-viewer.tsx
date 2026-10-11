import React from 'react';
import { Container } from '@/components/ui/container';
import type { ContentPage } from '@/types/cms';

interface ContentPageViewerProps {
  page: ContentPage;
}

export function ContentPageViewer({ page }: ContentPageViewerProps) {
  // Simple, safe markdown parser that avoids unsafe HTML injection
  const renderFormattedContent = (rawText: string) => {
    const lines = rawText.split('\n');

    return lines.map((line, idx) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return <div key={idx} className="h-3" />;
      }

      if (trimmed.startsWith('# ')) {
        return (
          <h1 key={idx} className="font-serif font-bold text-2xl sm:text-3xl text-white tracking-wide pt-4 pb-2 border-b border-neutral-800">
            {trimmed.replace('# ', '')}
          </h1>
        );
      }

      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={idx} className="font-serif font-bold text-lg text-luxury-gold pt-3 pb-1">
            {trimmed.replace('### ', '')}
          </h3>
        );
      }

      if (trimmed.startsWith('- ')) {
        return (
          <li key={idx} className="text-xs sm:text-sm text-neutral-300 ml-5 list-disc leading-relaxed">
            {trimmed.replace('- ', '')}
          </li>
        );
      }

      // Format bold (**text**)
      const parts = trimmed.split(/(\*\*.*?\*\*)/g);

      return (
        <p key={idx} className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-light">
          {parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={pIdx} className="font-semibold text-white">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          })}
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

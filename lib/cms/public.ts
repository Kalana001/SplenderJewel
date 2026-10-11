import { cache } from 'react';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { DEFAULT_CONTENT_PAGES } from '@/lib/cms/defaults';
import type { ContentPage } from '@/types/cms';

/**
 * Public accessor for informational content pages with graceful offline fallback.
 * Cached per request.
 */
export const getPublicContentPage = cache(async function getPublicContentPage(
  slug: string
): Promise<ContentPage | null> {
  const normalizedSlug = slug.toLowerCase().trim();

  try {
    const supabase = createPublicSupabaseClient();
    if (supabase) {
      const { data, error } = await (supabase.from('content_pages') as any)
        .select('*')
        .eq('slug', normalizedSlug)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          slug: data.slug,
          title: data.title,
          content: data.content,
          metaTitle: data.meta_title,
          metaDescription: data.meta_description,
          updatedAt: data.updated_at,
        };
      }
    }
  } catch {
    // Fall back to static canonical content
  }

  const fallback = DEFAULT_CONTENT_PAGES.find((p) => p.slug === normalizedSlug);
  if (fallback) {
    return {
      ...fallback,
      id: `fallback-${normalizedSlug}`,
      updatedAt: new Date().toISOString(),
    };
  }

  return null;
});

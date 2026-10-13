import { cache } from 'react';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { DEFAULT_CONTENT_PAGES, DEFAULT_HOMEPAGE_SECTIONS } from '@/lib/cms/defaults';
import type { ContentPage, HomepageSection } from '@/types/cms';

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

/**
 * Public accessor for homepage sections with CMS settings.
 * Cached per request.
 */
export const getPublicHomepageSection = cache(async function getPublicHomepageSection(
  sectionKey: string,
  client?: any
): Promise<HomepageSection | null> {
  const normalizedKey = sectionKey.toLowerCase().trim();

  try {
    const supabase = client !== undefined ? client : createPublicSupabaseClient();
    if (supabase) {
      const { data, error } = await (supabase.from('homepage_sections') as any)
        .select('*')
        .eq('section_key', normalizedKey)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          sectionKey: data.section_key,
          title: data.title,
          subtitle: data.subtitle,
          displayOrder: data.display_order,
          isEnabled: Boolean(data.is_enabled),
          configData: typeof data.config_data === 'object' && data.config_data !== null ? data.config_data : {},
          updatedAt: data.updated_at,
        };
      }
    }
  } catch {
    // Fall back to default seeded section
  }

  const fallback = DEFAULT_HOMEPAGE_SECTIONS.find((s) => s.sectionKey === normalizedKey);
  if (fallback) {
    return {
      ...fallback,
      id: `fallback-${normalizedKey}`,
      updatedAt: new Date().toISOString(),
    };
  }

  return null;
});

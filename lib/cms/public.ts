import { cache } from 'react';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { DEFAULT_CONTENT_PAGES, DEFAULT_HOMEPAGE_SECTIONS } from '@/lib/cms/defaults';
import type { ContentPage, HomepageSection, Banner } from '@/types/cms';

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

      if (error) {
        console.error(`[CMS] Database error loading content page "${normalizedSlug}":`, error.message);
      } else if (data) {
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
  } catch (err) {
    console.error(`[CMS] Unexpected error loading content page "${normalizedSlug}":`, err instanceof Error ? err.message : err);
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
 * Public accessor for a single homepage section with CMS settings.
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

      if (error) {
        console.error(`[CMS] Database error loading homepage section "${normalizedKey}":`, error.message);
      } else if (data) {
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
  } catch (err) {
    console.error(`[CMS] Unexpected error loading homepage section "${normalizedKey}":`, err instanceof Error ? err.message : err);
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

/**
 * Public accessor for all homepage sections.
 * Returns active configuration merged with defaults, sorted by display_order ASC.
 * Cached per request.
 */
export const getPublicHomepageSections = cache(async function getPublicHomepageSections(
  client?: any
): Promise<HomepageSection[]> {
  const mergedMap = new Map<string, HomepageSection>();

  // Initialize with seeded defaults
  DEFAULT_HOMEPAGE_SECTIONS.forEach((s, idx) => {
    mergedMap.set(s.sectionKey, {
      ...s,
      id: `default-${s.sectionKey}-${idx}`,
      updatedAt: new Date().toISOString(),
    });
  });

  try {
    const supabase = client !== undefined ? client : createPublicSupabaseClient();
    if (supabase) {
      const { data, error } = await (supabase.from('homepage_sections') as any)
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.error('[CMS] Database error loading homepage sections:', error.message);
      } else if (data && data.length > 0) {
        for (const row of data) {
          mergedMap.set(row.section_key, {
            id: row.id,
            sectionKey: row.section_key,
            title: row.title,
            subtitle: row.subtitle,
            displayOrder: typeof row.display_order === 'number' ? row.display_order : 0,
            isEnabled: Boolean(row.is_enabled),
            configData: typeof row.config_data === 'object' && row.config_data !== null ? row.config_data : {},
            updatedAt: row.updated_at,
          });
        }
      }
    }
  } catch (err) {
    console.error('[CMS] Unexpected error loading homepage sections:', err instanceof Error ? err.message : err);
  }

  return Array.from(mergedMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
});

/**
 * Public accessor for active promotional banners.
 * Filtered by is_active = true and ordered by display_order ASC, then created_at ASC.
 * Cached per request.
 */
export const getPublicBanners = cache(async function getPublicBanners(
  client?: any
): Promise<Banner[]> {
  try {
    const supabase = client !== undefined ? client : createPublicSupabaseClient();
    if (supabase) {
      const { data, error } = await (supabase.from('banners') as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[CMS] Database error loading public banners:', error.message);
        return [];
      }

      if (data && data.length > 0) {
        return data.map((row: any) => ({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          imageUrl: row.image_url,
          mobileImageUrl: row.mobile_image_url,
          linkUrl: row.link_url,
          buttonText: row.button_text,
          displayOrder: row.display_order,
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }
    }
  } catch (err) {
    console.error('[CMS] Unexpected error loading public banners:', err instanceof Error ? err.message : err);
  }

  return [];
});

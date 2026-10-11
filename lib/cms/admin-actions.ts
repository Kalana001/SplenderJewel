'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type {
  HomepageSection,
  Banner,
  CreateBannerInput,
  UpdateBannerInput,
  ContentPage,
  UpdateContentPageInput,
} from '@/types/cms';

import { DEFAULT_HOMEPAGE_SECTIONS, DEFAULT_CONTENT_PAGES } from '@/lib/cms/defaults';

// =============================================================================
// 1. HOMEPAGE SECTIONS ACTIONS
// =============================================================================

export async function getAdminHomepageSections(): Promise<{
  success: boolean;
  sections: HomepageSection[];
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data, error } = await (adminClient.from('homepage_sections') as any)
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      return { success: false, sections: [], error: error.message };
    }

    // If database table has rows, return them mapped
    if (data && data.length > 0) {
      const sections: HomepageSection[] = data.map((row: any) => ({
        id: row.id,
        sectionKey: row.section_key,
        title: row.title,
        subtitle: row.subtitle,
        displayOrder: row.display_order,
        isEnabled: Boolean(row.is_enabled),
        configData: typeof row.config_data === 'object' && row.config_data !== null ? row.config_data : {},
        updatedAt: row.updated_at,
      }));
      return { success: true, sections };
    }

    // Otherwise return default seeded sections
    const defaultSections: HomepageSection[] = DEFAULT_HOMEPAGE_SECTIONS.map((s, index) => ({
      ...s,
      id: `default-${s.sectionKey}-${index}`,
      updatedAt: new Date().toISOString(),
    }));

    return { success: true, sections: defaultSections };
  } catch (err: any) {
    return { success: false, sections: [], error: err.message || 'Failed to fetch homepage sections.' };
  }
}

export async function updateHomepageSection(
  sectionId: string,
  updates: {
    sectionKey?: string;
    title?: string | null;
    subtitle?: string | null;
    displayOrder?: number;
    isEnabled?: boolean;
    configData?: Record<string, any>;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!sectionId) {
      return { success: false, error: 'Section ID is required.' };
    }

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.title !== undefined) payload.title = updates.title ? updates.title.trim() : null;
    if (updates.subtitle !== undefined) payload.subtitle = updates.subtitle ? updates.subtitle.trim() : null;
    if (updates.displayOrder !== undefined) payload.display_order = updates.displayOrder;
    if (updates.isEnabled !== undefined) payload.is_enabled = updates.isEnabled;
    if (updates.configData !== undefined) payload.config_data = updates.configData;

    // Check if updating existing or inserting default
    if (sectionId.startsWith('default-')) {
      const sectionKey = updates.sectionKey || sectionId.replace('default-', '').split('-')[0];
      const { error } = await (adminClient.from('homepage_sections') as any).upsert(
        {
          section_key: sectionKey,
          title: payload.title,
          subtitle: payload.subtitle,
          display_order: payload.display_order || 0,
          is_enabled: payload.is_enabled ?? true,
          config_data: payload.config_data || {},
        },
        { onConflict: 'section_key' }
      );
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await (adminClient.from('homepage_sections') as any)
        .update(payload)
        .eq('id', sectionId);
      if (error) return { success: false, error: error.message };
    }

    revalidatePath('/admin/homepage');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update section.' };
  }
}

// =============================================================================
// 2. BANNERS ACTIONS
// =============================================================================

export async function getAdminBanners(): Promise<{
  success: boolean;
  banners: Banner[];
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data, error } = await (adminClient.from('banners') as any)
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      return { success: false, banners: [], error: error.message };
    }

    const banners: Banner[] = (data || []).map((row: any) => ({
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

    return { success: true, banners };
  } catch (err: any) {
    return { success: false, banners: [], error: err.message || 'Failed to fetch banners.' };
  }
}

export async function createAdminBanner(
  input: CreateBannerInput
): Promise<{ success: boolean; banner?: Banner; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!input.title || !input.title.trim()) {
      return { success: false, error: 'Banner title is required.' };
    }
    if (!input.imageUrl || !input.imageUrl.trim()) {
      return { success: false, error: 'Banner desktop image URL is required.' };
    }

    const payload = {
      title: input.title.trim(),
      subtitle: input.subtitle ? input.subtitle.trim() : null,
      image_url: input.imageUrl.trim(),
      mobile_image_url: input.mobileImageUrl ? input.mobileImageUrl.trim() : null,
      link_url: input.linkUrl ? input.linkUrl.trim() : null,
      button_text: input.buttonText ? input.buttonText.trim() : null,
      display_order: input.displayOrder ?? 0,
      is_active: input.isActive ?? true,
    };

    const { data, error } = await (adminClient.from('banners') as any)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/banners');
    revalidatePath('/');

    return {
      success: true,
      banner: {
        id: data.id,
        title: data.title,
        subtitle: data.subtitle,
        imageUrl: data.image_url,
        mobileImageUrl: data.mobile_image_url,
        linkUrl: data.link_url,
        buttonText: data.button_text,
        displayOrder: data.display_order,
        isActive: Boolean(data.is_active),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create banner.' };
  }
}

export async function updateAdminBanner(
  id: string,
  input: UpdateBannerInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!id) return { success: false, error: 'Banner ID is required.' };

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (input.title !== undefined) payload.title = input.title.trim();
    if (input.subtitle !== undefined) payload.subtitle = input.subtitle ? input.subtitle.trim() : null;
    if (input.imageUrl !== undefined) payload.image_url = input.imageUrl.trim();
    if (input.mobileImageUrl !== undefined) payload.mobile_image_url = input.mobileImageUrl ? input.mobileImageUrl.trim() : null;
    if (input.linkUrl !== undefined) payload.link_url = input.linkUrl ? input.linkUrl.trim() : null;
    if (input.buttonText !== undefined) payload.button_text = input.buttonText ? input.buttonText.trim() : null;
    if (input.displayOrder !== undefined) payload.display_order = input.displayOrder;
    if (input.isActive !== undefined) payload.is_active = input.isActive;

    const { error } = await (adminClient.from('banners') as any)
      .update(payload)
      .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/banners');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update banner.' };
  }
}

export async function deleteAdminBanner(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { error } = await (adminClient.from('banners') as any)
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/banners');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete banner.' };
  }
}

// =============================================================================
// 3. CONTENT PAGES ACTIONS
// =============================================================================

export async function getAdminContentPages(): Promise<{
  success: boolean;
  pages: ContentPage[];
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data, error } = await (adminClient.from('content_pages') as any)
      .select('*')
      .order('slug', { ascending: true });

    if (error) {
      return { success: false, pages: [], error: error.message };
    }

    // Merge database rows with default pages so all 7 standard pages are always visible
    const existingMap: Record<string, ContentPage> = {};
    if (data && Array.isArray(data)) {
      for (const row of data) {
        existingMap[row.slug] = {
          id: row.id,
          slug: row.slug,
          title: row.title,
          content: row.content,
          metaTitle: row.meta_title,
          metaDescription: row.meta_description,
          updatedAt: row.updated_at,
        };
      }
    }

    const mergedPages: ContentPage[] = DEFAULT_CONTENT_PAGES.map((def, idx) => {
      if (existingMap[def.slug]) {
        return existingMap[def.slug];
      }
      return {
        ...def,
        id: `default-${def.slug}-${idx}`,
        updatedAt: new Date().toISOString(),
      };
    });

    return { success: true, pages: mergedPages };
  } catch (err: any) {
    return { success: false, pages: [], error: err.message || 'Failed to fetch content pages.' };
  }
}

export async function updateAdminContentPage(
  slug: string,
  input: UpdateContentPageInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!slug) return { success: false, error: 'Page slug is required.' };
    if (!input.title || !input.title.trim()) return { success: false, error: 'Title is required.' };

    const payload = {
      slug: slug.trim().toLowerCase(),
      title: input.title.trim(),
      content: input.content || '',
      meta_title: input.metaTitle ? input.metaTitle.trim() : null,
      meta_description: input.metaDescription ? input.metaDescription.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (adminClient.from('content_pages') as any)
      .upsert(payload, { onConflict: 'slug' });

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/content');
    revalidatePath(`/${slug}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update content page.' };
  }
}

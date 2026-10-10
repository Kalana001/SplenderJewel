'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type { Category } from '@/types/product';

export interface CategoryWithProductCount extends Category {
  productCount: number;
}

export interface CategoryFormInput {
  name: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export interface CategoryActionResult {
  success: boolean;
  category?: Category;
  error?: string;
}

/**
 * Normalizes a string into a URL-safe lowercase slug
 */
export async function generateCategorySlug(text: string): Promise<string> {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Retrieves all categories for the admin panel, including product count.
 * Requires active administrator authentication.
 */
export async function getAdminCategories(): Promise<{
  success: boolean;
  categories: CategoryWithProductCount[];
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data: categoriesRaw, error: catError } = await (adminClient.from('categories') as any)
      .select(`
        id,
        name,
        slug,
        description,
        image_url,
        display_order,
        is_active,
        created_at,
        products ( id )
      `)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (catError) {
      return { success: false, categories: [], error: catError.message };
    }

    const categories: CategoryWithProductCount[] = (categoriesRaw || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.image_url,
      displayOrder: row.display_order,
      isActive: row.is_active,
      createdAt: row.created_at,
      productCount: Array.isArray(row.products) ? row.products.length : 0,
    }));

    return { success: true, categories };
  } catch (err: unknown) {
    return {
      success: false,
      categories: [],
      error: err instanceof Error ? err.message : 'Failed to load categories',
    };
  }
}

/**
 * Retrieves all active categories for public storefront navigation and filters.
 */
export async function getPublicCategories(): Promise<Category[]> {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, description, image_url, display_order, is_active, created_at')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error || !data) {
      return [];
    }

    return (data as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.image_url,
      displayOrder: row.display_order,
      isActive: row.is_active,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Admin Action: Create a new category
 */
export async function createCategoryAction(input: CategoryFormInput): Promise<CategoryActionResult> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const name = input.name?.trim();
    if (!name) {
      return { success: false, error: 'Category name is required.' };
    }

    const slug = input.slug?.trim() ? await generateCategorySlug(input.slug) : await generateCategorySlug(name);
    if (!slug) {
      return { success: false, error: 'A valid URL slug is required.' };
    }

    // Verify slug uniqueness
    const { data: existing } = await (adminClient.from('categories') as any)
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      return { success: false, error: `The slug "${slug}" is already in use by another category.` };
    }

    const displayOrder = typeof input.displayOrder === 'number' ? input.displayOrder : 0;
    const isActive = input.isActive !== undefined ? input.isActive : true;

    const { data: created, error: insertError } = await (adminClient.from('categories') as any)
      .insert({
        name,
        slug,
        description: input.description?.trim() || null,
        image_url: input.imageUrl?.trim() || null,
        display_order: displayOrder,
        is_active: isActive,
        meta_title: input.metaTitle?.trim() || null,
        meta_description: input.metaDescription?.trim() || null,
      })
      .select()
      .single();

    if (insertError || !created) {
      return { success: false, error: insertError?.message || 'Failed to create category.' };
    }

    revalidatePath('/admin/categories');
    revalidatePath('/shop');
    revalidatePath('/');

    return {
      success: true,
      category: {
        id: created.id,
        name: created.name,
        slug: created.slug,
        description: created.description,
        imageUrl: created.image_url,
        displayOrder: created.display_order,
        isActive: created.is_active,
        createdAt: created.created_at,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred creating the category.',
    };
  }
}

/**
 * Admin Action: Update an existing category
 */
export async function updateCategoryAction(
  id: string,
  input: CategoryFormInput
): Promise<CategoryActionResult> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!id?.trim()) {
      return { success: false, error: 'Category ID is required.' };
    }

    const name = input.name?.trim();
    if (!name) {
      return { success: false, error: 'Category name is required.' };
    }

    const slug = input.slug?.trim() ? await generateCategorySlug(input.slug) : await generateCategorySlug(name);
    if (!slug) {
      return { success: false, error: 'A valid URL slug is required.' };
    }

    // Check slug collision excluding this record
    const { data: existing } = await (adminClient.from('categories') as any)
      .select('id')
      .eq('slug', slug)
      .neq('id', id)
      .maybeSingle();

    if (existing) {
      return { success: false, error: `The slug "${slug}" is already in use by another category.` };
    }

    const updatePayload: Record<string, any> = {
      name,
      slug,
      description: input.description !== undefined ? (input.description?.trim() || null) : undefined,
      image_url: input.imageUrl !== undefined ? (input.imageUrl?.trim() || null) : undefined,
      display_order: typeof input.displayOrder === 'number' ? input.displayOrder : 0,
      is_active: input.isActive !== undefined ? input.isActive : true,
      meta_title: input.metaTitle !== undefined ? (input.metaTitle?.trim() || null) : undefined,
      meta_description: input.metaDescription !== undefined ? (input.metaDescription?.trim() || null) : undefined,
    };

    const { data: updated, error: updateError } = await (adminClient.from('categories') as any)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      return { success: false, error: updateError?.message || 'Failed to update category.' };
    }

    revalidatePath('/admin/categories');
    revalidatePath(`/category/${slug}`);
    revalidatePath('/shop');
    revalidatePath('/');

    return {
      success: true,
      category: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        imageUrl: updated.image_url,
        displayOrder: updated.display_order,
        isActive: updated.is_active,
        createdAt: updated.created_at,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred updating the category.',
    };
  }
}

/**
 * Admin Action: Toggle category publication/active status
 */
export async function toggleCategoryActiveAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { error } = await (adminClient.from('categories') as any)
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/categories');
    revalidatePath('/shop');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to toggle category status.',
    };
  }
}

/**
 * Admin Action: Safely delete a category.
 * Prevents accidental destructive deletion if products still reference this category.
 */
export async function deleteCategoryAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // Check dependent products
    const { count, error: countError } = await (adminClient.from('products') as any)
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);

    if (countError) {
      return { success: false, error: 'Failed to verify dependent products.' };
    }

    if (count && count > 0) {
      return {
        success: false,
        error: `Cannot delete this category: ${count} product(s) are currently assigned to it. Reassign or remove those products before deleting.`,
      };
    }

    const { error: deleteError } = await (adminClient.from('categories') as any)
      .delete()
      .eq('id', id);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/admin/categories');
    revalidatePath('/shop');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred deleting the category.',
    };
  }
}

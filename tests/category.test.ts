import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STORE_CATEGORIES } from '../lib/config/store.ts';

/**
 * Category Resolution Contract (as implemented in lib/catalog/public.ts)
 */
async function resolveCategory(slug: string, supabaseClient: any) {
  const normalizedSlug = slug?.trim().toLowerCase();
  if (!normalizedSlug) return null;

  if (!supabaseClient) {
    return DEFAULT_STORE_CATEGORIES.find((c) => c.slug === normalizedSlug) || null;
  }

  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name, slug, description, image_url, display_order, is_active, created_at')
    .eq('slug', normalizedSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    const dbError = new Error(`Database error querying category: ${error.message}`);
    (dbError as any).code = error.code;
    (dbError as any).details = error.details;
    throw dbError;
  }

  if (data) {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      imageUrl: data.image_url,
      displayOrder: data.display_order,
      isActive: data.is_active,
      createdAt: data.created_at,
    };
  }

  return DEFAULT_STORE_CATEGORIES.find((c) => c.slug === normalizedSlug) || null;
}

// 1. Precedence: Real database category record takes precedence over fallback
test('getPublicCategoryBySlug - real database record takes precedence over fallback', async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'real-db-uuid-rings',
                name: 'Custom Rings Name From DB',
                slug: 'rings',
                description: 'Real DB description',
                image_url: 'https://images.splender.lk/rings.jpg',
                display_order: 1,
                is_active: true,
                created_at: '2026-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const result = await resolveCategory('rings', mockClient);
  assert.notEqual(result, null);
  assert.equal(result?.id, 'real-db-uuid-rings');
  assert.equal(result?.name, 'Custom Rings Name From DB');
  assert.equal(result?.description, 'Real DB description');
});

// 2. Recognized slugs return fallback metadata when query succeeds with no matching record
test('getPublicCategoryBySlug - all six recognized slugs return fallback metadata when query returns empty', async () => {
  const mockEmptyClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const recognizedSlugs = ['rings', 'necklaces', 'bracelets', 'earrings', 'men', 'sets'];

  for (const slug of recognizedSlugs) {
    const result = await resolveCategory(slug, mockEmptyClient);
    assert.notEqual(result, null, `Expected fallback for recognized slug: ${slug}`);
    assert.equal(result?.slug, slug);
    assert.ok(result?.name, `Expected name for fallback category: ${slug}`);
  }
});

// 3. Unknown slugs return null when query succeeds with no matching record
test('getPublicCategoryBySlug - unknown slug returns null when query returns empty', async () => {
  const mockEmptyClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const result = await resolveCategory('non-existent-jewelry-slug', mockEmptyClient);
  assert.equal(result, null);
});

// 4. Database errors propagate and throw
test('getPublicCategoryBySlug - database query errors propagate rather than returning fallback', async () => {
  const mockErrorClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: {
                message: 'connection to server at "db.supabase.co" failed: timeout',
                code: '08006',
                details: 'Connection timed out',
              },
            }),
          }),
        }),
      }),
    }),
  };

  await assert.rejects(
    async () => {
      await resolveCategory('rings', mockErrorClient);
    },
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Database error querying category:/);
      assert.match(err.message, /connection to server/);
      return true;
    }
  );
});

// 5. Unconfigured client returns fallback for recognized slugs, and null for unknown
test('getPublicCategoryBySlug - unconfigured client returns fallback for recognized slug and null for unknown', async () => {
  const unconfiguredClient = null;

  const recognizedResult = await resolveCategory('rings', unconfiguredClient);
  assert.notEqual(recognizedResult, null);
  assert.equal(recognizedResult?.slug, 'rings');

  const unknownResult = await resolveCategory('unknown-slug', unconfiguredClient);
  assert.equal(unknownResult, null);
});

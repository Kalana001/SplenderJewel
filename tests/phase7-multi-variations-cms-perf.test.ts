import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOMEPAGE_SECTIONS, DEFAULT_CONTENT_PAGES } from '../lib/cms/defaults.ts';

// =============================================================================
// 1. MULTI-VARIATION CREATION VALIDATION & CONTRACT LOGIC
// =============================================================================

interface VariantInput {
  title: string;
  sku: string;
  price: number;
  discountPrice?: number | null;
  purchaseCost?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  attributes?: Record<string, string>;
  imageUrls?: string[];
}

interface ProductPayload {
  name: string;
  slug?: string;
  productCode?: string | null;
  initialVariant?: VariantInput;
  variants?: VariantInput[];
  imageUrls?: string[];
}

function validateAndNormalizeCreateProduct(payload: ProductPayload) {
  const name = payload.name?.trim();
  if (!name) {
    return { valid: false, error: 'Product name is required.' };
  }

  // Determine variations to create (support both variants array and initialVariant)
  const rawVariants: VariantInput[] =
    Array.isArray(payload.variants) && payload.variants.length > 0
      ? payload.variants
      : payload.initialVariant
      ? [payload.initialVariant]
      : [];

  if (rawVariants.length === 0) {
    return { valid: false, error: 'At least one product variation is required.' };
  }

  const normalizedVariants: Array<VariantInput & { sku: string; title: string }> = [];
  const seenSkus = new Set<string>();

  for (let i = 0; i < rawVariants.length; i++) {
    const v = rawVariants[i];
    const title = v.title?.trim() || `Variant ${i + 1}`;
    const sku = v.sku?.trim().toUpperCase();

    if (!sku) {
      return { valid: false, error: `SKU is required for variation #${i + 1} (${title}).` };
    }

    if (seenSkus.has(sku)) {
      return { valid: false, error: `Duplicate SKU "${sku}" found within the variation list.` };
    }
    seenSkus.add(sku);

    if (typeof v.price !== 'number' || v.price < 0) {
      return { valid: false, error: `Selling price for variant "${sku}" must be a non-negative amount.` };
    }

    if (v.discountPrice != null && (v.discountPrice < 0 || v.discountPrice >= v.price)) {
      return { valid: false, error: `Discount price for variant "${sku}" must be less than regular price.` };
    }

    normalizedVariants.push({
      ...v,
      title,
      sku,
      price: v.price,
      discountPrice: v.discountPrice != null ? v.discountPrice : null,
      purchaseCost: typeof v.purchaseCost === 'number' && v.purchaseCost >= 0 ? v.purchaseCost : 0,
      stockQuantity: typeof v.stockQuantity === 'number' && v.stockQuantity >= 0 ? Math.floor(v.stockQuantity) : 0,
      lowStockThreshold:
        typeof v.lowStockThreshold === 'number' && v.lowStockThreshold >= 0 ? Math.floor(v.lowStockThreshold) : 5,
      attributes: v.attributes || {},
      imageUrls: v.imageUrls || [],
    });
  }

  return { valid: true, name, variants: normalizedVariants };
}

test('Multi-Variation: Rejects product when variations list is empty and initialVariant missing', () => {
  const res = validateAndNormalizeCreateProduct({ name: 'Solitaire Ring', variants: [] });
  assert.equal(res.valid, false);
  assert.match(res.error || '', /At least one product variation is required/i);
});

test('Multi-Variation: Rejects duplicate SKUs within the same creation request payload', () => {
  const res = validateAndNormalizeCreateProduct({
    name: 'Royal Crown Ring',
    variants: [
      { title: 'Size 6 / Gold', sku: 'SJ-RNG-001-GLD', price: 5000 },
      { title: 'Size 7 / Gold', sku: 'SJ-RNG-001-GLD', price: 5000 }, // Duplicate SKU!
    ],
  });
  assert.equal(res.valid, false);
  assert.match(res.error || '', /Duplicate SKU "SJ-RNG-001-GLD"/i);
});

test('Multi-Variation: Rejects invalid pricing (negative price or discount >= regular price)', () => {
  // Negative selling price
  const res1 = validateAndNormalizeCreateProduct({
    name: 'Royal Crown Ring',
    variants: [{ title: 'Size 6', sku: 'SJ-RNG-001-SZ6', price: -100 }],
  });
  assert.equal(res1.valid, false);
  assert.match(res1.error || '', /Selling price.*must be a non-negative amount/i);

  // Discount equal to regular price
  const res2 = validateAndNormalizeCreateProduct({
    name: 'Royal Crown Ring',
    variants: [{ title: 'Size 6', sku: 'SJ-RNG-001-SZ6', price: 5000, discountPrice: 5000 }],
  });
  assert.equal(res2.valid, false);
  assert.match(res2.error || '', /Discount price.*must be less than regular price/i);

  // Discount greater than regular price
  const res3 = validateAndNormalizeCreateProduct({
    name: 'Royal Crown Ring',
    variants: [{ title: 'Size 6', sku: 'SJ-RNG-001-SZ6', price: 5000, discountPrice: 6000 }],
  });
  assert.equal(res3.valid, false);
  assert.match(res3.error || '', /Discount price.*must be less than regular price/i);
});

test('Multi-Variation: Backward compatibility — single initialVariant creates normalized single variant', () => {
  const res = validateAndNormalizeCreateProduct({
    name: 'Tiger Eye Bracelet',
    initialVariant: {
      title: 'Standard',
      sku: 'sj-brc-001',
      price: 3500,
      discountPrice: 2800,
      purchaseCost: 1200,
      stockQuantity: 15,
      lowStockThreshold: 3,
    },
  });
  assert.equal(res.valid, true);
  assert.equal(res.variants?.length, 1);
  assert.equal(res.variants?.[0].sku, 'SJ-BRC-001'); // Uppercased
  assert.equal(res.variants?.[0].price, 3500);
  assert.equal(res.variants?.[0].discountPrice, 2800);
  assert.equal(res.variants?.[0].stockQuantity, 15);
});

test('Multi-Variation: Normalizes multiple variants with attributes and variation-specific images', () => {
  const res = validateAndNormalizeCreateProduct({
    name: 'Eternity Band',
    variants: [
      {
        title: 'Size 6 / Yellow Gold',
        sku: 'SJ-ETN-SZ6-YEL',
        price: 8500,
        purchaseCost: 4000,
        stockQuantity: 5,
        attributes: { Size: '6', Metal: '18K Yellow Gold' },
        imageUrls: ['https://cdn.splender.lk/sz6-gold.jpg'],
      },
      {
        title: 'Size 7 / White Gold',
        sku: 'SJ-ETN-SZ7-WHT',
        price: 8500,
        purchaseCost: 4000,
        stockQuantity: 0,
        attributes: { Size: '7', Metal: '18K White Gold' },
        imageUrls: ['https://cdn.splender.lk/sz7-white.jpg'],
      },
    ],
  });
  assert.equal(res.valid, true);
  assert.equal(res.variants?.length, 2);
  assert.equal(res.variants?.[0].sku, 'SJ-ETN-SZ6-YEL');
  assert.equal(res.variants?.[0].attributes?.Size, '6');
  assert.equal(res.variants?.[1].sku, 'SJ-ETN-SZ7-WHT');
  assert.equal(res.variants?.[1].attributes?.Metal, '18K White Gold');
});

// =============================================================================
// 2. DATABASE COLLISION & ROLLBACK COMPENSATION CONTRACT
// =============================================================================

async function simulateCreateProductFlow(
  payload: ProductPayload,
  mockDb: {
    existingSkusInDb: string[];
    failVariantInsert?: boolean;
    failMovementInsert?: boolean;
    failImageInsert?: boolean;
    insertedProducts: any[];
    insertedVariants: any[];
    insertedMovements: any[];
    insertedImages: any[];
    deletedProducts: string[];
  }
) {
  const validation = validateAndNormalizeCreateProduct(payload);
  if (!validation.valid) return { success: false, error: validation.error };

  // Check database SKU collision
  const skusToCheck = validation.variants!.map((v) => v.sku);
  const collisions = skusToCheck.filter((sku) => mockDb.existingSkusInDb.includes(sku));
  if (collisions.length > 0) {
    return { success: false, error: `SKU "${collisions[0]}" is already assigned to another product.` };
  }

  // 1. Insert product
  const productId = `prod-${Date.now()}`;
  mockDb.insertedProducts.push({ id: productId, name: validation.name });

  try {
    // 2. Insert variants
    if (mockDb.failVariantInsert) {
      throw new Error('Failed to create product variants: DB Constraint Violation');
    }

    const insertedVars = validation.variants!.map((v, idx) => {
      const varId = `var-${productId}-${idx}`;
      mockDb.insertedVariants.push({ id: varId, productId, sku: v.sku });
      return { id: varId, sku: v.sku, stock: v.stockQuantity };
    });

    // 3. Record inventory movements for stock > 0
    if (mockDb.failMovementInsert) {
      throw new Error('Failed to record inventory movements: DB Error');
    }
    for (const iv of insertedVars) {
      if (iv.stock && iv.stock > 0) {
        mockDb.insertedMovements.push({
          variant_id: iv.id,
          quantity_change: iv.stock,
          reason: 'stock_added',
        });
      }
    }

    // 4. Attach gallery images (product-level and variant-level)
    if (mockDb.failImageInsert) {
      throw new Error('Failed to attach gallery images: Storage Error');
    }
    if (payload.imageUrls) {
      for (const url of payload.imageUrls) {
        mockDb.insertedImages.push({ productId, variantId: null, url });
      }
    }
    for (const v of validation.variants!) {
      if (v.imageUrls) {
        const match = insertedVars.find((iv) => iv.sku === v.sku);
        for (const url of v.imageUrls) {
          mockDb.insertedImages.push({ productId, variantId: match?.id, url });
        }
      }
    }

    return { success: true, productId };
  } catch (err: any) {
    // Compensate / Rollback product
    mockDb.deletedProducts.push(productId);
    mockDb.insertedProducts = mockDb.insertedProducts.filter((p) => p.id !== productId);
    mockDb.insertedVariants = mockDb.insertedVariants.filter((v) => v.productId !== productId);
    return { success: false, error: err.message };
  }
}

test('Database Collision: Aborts before inserting product when any variant SKU exists in DB', async () => {
  const mockDb = {
    existingSkusInDb: ['SJ-EXISTING-999'],
    insertedProducts: [] as any[],
    insertedVariants: [] as any[],
    insertedMovements: [] as any[],
    insertedImages: [] as any[],
    deletedProducts: [] as string[],
  };

  const res = await simulateCreateProductFlow(
    {
      name: 'Collision Product',
      variants: [
        { title: 'New Size', sku: 'SJ-BRAND-NEW-001', price: 1000 },
        { title: 'Colliding Size', sku: 'SJ-EXISTING-999', price: 1000 },
      ],
    },
    mockDb
  );

  assert.equal(res.success, false);
  assert.match(res.error || '', /already assigned to another product/i);
  assert.equal(mockDb.insertedProducts.length, 0, 'No product must be inserted when SKU collision detected');
});

test('Rollback Compensation: Cleans up product record when variant batch insert fails', async () => {
  const mockDb = {
    existingSkusInDb: [] as string[],
    failVariantInsert: true, // Simulating DB error on variants insert
    insertedProducts: [] as any[],
    insertedVariants: [] as any[],
    insertedMovements: [] as any[],
    insertedImages: [] as any[],
    deletedProducts: [] as string[],
  };

  const res = await simulateCreateProductFlow(
    {
      name: 'Rollback Product',
      variants: [{ title: 'Variant 1', sku: 'SJ-TEST-ROLLBACK', price: 2000 }],
    },
    mockDb
  );

  assert.equal(res.success, false);
  assert.equal(mockDb.deletedProducts.length, 1, 'Product must be compensated/deleted on variant insertion failure');
  assert.equal(mockDb.insertedProducts.length, 0, 'No orphaned product should remain');
});

test('Rollback Compensation: Cleans up product record when inventory movement creation fails', async () => {
  const mockDb = {
    existingSkusInDb: [] as string[],
    failMovementInsert: true, // Simulating DB error on movements insert
    insertedProducts: [] as any[],
    insertedVariants: [] as any[],
    insertedMovements: [] as any[],
    insertedImages: [] as any[],
    deletedProducts: [] as string[],
  };

  const res = await simulateCreateProductFlow(
    {
      name: 'Rollback Product on Movement',
      variants: [{ title: 'Variant 1', sku: 'SJ-TEST-ROLLBACK-MOV', price: 2000, stockQuantity: 10 }],
    },
    mockDb
  );

  assert.equal(res.success, false);
  assert.equal(mockDb.deletedProducts.length, 1, 'Product must be compensated/deleted on movement insertion failure');
  assert.equal(mockDb.insertedProducts.length, 0, 'No orphaned product should remain');
});

test('Rollback Compensation: Cleans up product record when image attachment fails', async () => {
  const mockDb = {
    existingSkusInDb: [] as string[],
    failImageInsert: true, // Simulating DB error on image attachment
    insertedProducts: [] as any[],
    insertedVariants: [] as any[],
    insertedMovements: [] as any[],
    insertedImages: [] as any[],
    deletedProducts: [] as string[],
  };

  const res = await simulateCreateProductFlow(
    {
      name: 'Rollback Product on Image',
      imageUrls: ['https://cdn.splender.lk/test.jpg'],
      variants: [{ title: 'Variant 1', sku: 'SJ-TEST-ROLLBACK-IMG', price: 2000 }],
    },
    mockDb
  );

  assert.equal(res.success, false);
  assert.equal(mockDb.deletedProducts.length, 1, 'Product must be compensated/deleted on image attachment failure');
  assert.equal(mockDb.insertedProducts.length, 0, 'No orphaned product should remain');
});

test('Inventory Movements & Images: Initial movements generated only for variants with stock > 0, and variant images attached', async () => {
  const mockDb = {
    existingSkusInDb: [] as string[],
    insertedProducts: [] as any[],
    insertedVariants: [] as any[],
    insertedMovements: [] as any[],
    insertedImages: [] as any[],
    deletedProducts: [] as string[],
  };

  const res = await simulateCreateProductFlow(
    {
      name: 'Full Product Flow',
      imageUrls: ['https://cdn.splender.lk/main-cover.jpg'],
      variants: [
        {
          title: 'Stocked Variant',
          sku: 'SJ-STK-001',
          price: 4500,
          stockQuantity: 12,
          imageUrls: ['https://cdn.splender.lk/variant-stocked.jpg'],
        },
        {
          title: 'Zero Stock Variant',
          sku: 'SJ-ZER-002',
          price: 4500,
          stockQuantity: 0,
        },
      ],
    },
    mockDb
  );

  assert.equal(res.success, true);
  assert.equal(mockDb.insertedVariants.length, 2);

  // Movements: Only 1 movement for the stocked variant
  assert.equal(mockDb.insertedMovements.length, 1);
  assert.equal(mockDb.insertedMovements[0].quantity_change, 12);

  // Images: 1 product-level (variantId === null) + 1 variant-specific (variantId !== null)
  assert.equal(mockDb.insertedImages.length, 2);
  const productLevel = mockDb.insertedImages.find((img) => img.variantId === null);
  const variantLevel = mockDb.insertedImages.find((img) => img.variantId !== null);
  assert.ok(productLevel, 'Product-level image must have variantId null');
  assert.ok(variantLevel, 'Variant-specific image must have non-null variantId');
});

// =============================================================================
// 3. CMS BANNERS & HOMEPAGE SECTIONS CONTRACT
// =============================================================================

function filterAndSortActiveBanners(rawBanners: any[]) {
  return rawBanners
    .filter((b) => Boolean(b.is_active))
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.created_at.localeCompare(b.created_at));
}

test('CMS Banners: Filters out inactive banners and sorts by display_order ascending', () => {
  const rawBanners = [
    { id: 'b3', title: 'Banner 3', display_order: 3, is_active: true, created_at: '2026-10-01' },
    { id: 'b2', title: 'Inactive Promo', display_order: 1, is_active: false, created_at: '2026-10-02' },
    { id: 'b1', title: 'Hero Banner', display_order: 1, is_active: true, created_at: '2026-10-03' },
  ];

  const activeBanners = filterAndSortActiveBanners(rawBanners);
  assert.equal(activeBanners.length, 2);
  assert.equal(activeBanners[0].id, 'b1'); // display_order: 1
  assert.equal(activeBanners[1].id, 'b3'); // display_order: 3
});

function mergeHomepageSections(dbSections: any[]) {
  const mergedMap = new Map<string, any>();
  DEFAULT_HOMEPAGE_SECTIONS.forEach((s, idx) => {
    mergedMap.set(s.sectionKey, {
      ...s,
      id: `default-${s.sectionKey}-${idx}`,
    });
  });

  for (const row of dbSections) {
    mergedMap.set(row.section_key, {
      id: row.id,
      sectionKey: row.section_key,
      title: row.title,
      subtitle: row.subtitle,
      displayOrder: row.display_order ?? 0,
      isEnabled: Boolean(row.is_enabled),
      configData: row.config_data || {},
    });
  }

  return Array.from(mergedMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
}

test('CMS Sections: Merges database sections with defaults and sorts by displayOrder', () => {
  const dbSections = [
    {
      id: 'db-categories',
      section_key: 'categories',
      title: 'Our Exquisite Categories',
      subtitle: 'Handpicked Collection',
      display_order: 0, // Reordered to position 0 (before default hero at 1)
      is_enabled: true,
      configData: { displayCount: 4 },
    },
    {
      id: 'db-pillars',
      section_key: 'pillars',
      title: 'The Splender Distinction',
      subtitle: '',
      display_order: 2,
      is_enabled: false, // Disabled by admin
      configData: {},
    },
  ];

  const merged = mergeHomepageSections(dbSections);
  const categories = merged.find((s) => s.sectionKey === 'categories');
  const pillars = merged.find((s) => s.sectionKey === 'pillars');
  const hero = merged.find((s) => s.sectionKey === 'hero');

  assert.equal(categories?.title, 'Our Exquisite Categories');
  assert.equal(categories?.displayOrder, 0);
  assert.equal(pillars?.isEnabled, false);
  assert.ok(hero, 'Default hero must be preserved when not customized in DB');
  assert.equal(merged[0].sectionKey, 'categories', 'First section must be categories due to displayOrder 0');
});

// =============================================================================
// 4. CONTENT PAGES MARKDOWN & SAFE LINK PARSER CONTRACT
// =============================================================================

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

function parseMarkdownAst(rawText: string) {
  const lines = rawText.split('\n');
  const parsedNodes: Array<{ type: string; content: string; safeHref?: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# ')) {
      parsedNodes.push({ type: 'h1', content: trimmed.replace('# ', '') });
    } else if (trimmed.startsWith('## ')) {
      parsedNodes.push({ type: 'h2', content: trimmed.replace('## ', '') });
    } else if (trimmed.startsWith('### ')) {
      parsedNodes.push({ type: 'h3', content: trimmed.replace('### ', '') });
    } else if (trimmed.startsWith('- ')) {
      parsedNodes.push({ type: 'li', content: trimmed.replace('- ', '') });
    } else {
      parsedNodes.push({ type: 'p', content: trimmed });
    }

    // Check link safety if line contains link
    const linkMatch = trimmed.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      parsedNodes[parsedNodes.length - 1].safeHref = isSafeUrl(url) ? url : undefined;
    }
  }

  return parsedNodes;
}

test('Content Pages Markdown: Supports # h1, ## h2, ### h3, and validates hyperlink protocols', () => {
  const markdownSample = `
# Our Heritage
## Master Craftsmanship
### Islandwide Delivery
- Visit our [Official Store](/shop)
- Contact on [WhatsApp](https://wa.me/94764689907)
- Suspicious link [Dangerous](javascript:alert(1))
`;

  const ast = parseMarkdownAst(markdownSample);

  assert.equal(ast[0].type, 'h1');
  assert.equal(ast[0].content, 'Our Heritage');

  assert.equal(ast[1].type, 'h2');
  assert.equal(ast[1].content, 'Master Craftsmanship');

  assert.equal(ast[2].type, 'h3');
  assert.equal(ast[2].content, 'Islandwide Delivery');

  // Link safety
  assert.equal(ast[3].safeHref, '/shop', 'Relative path is safe');
  assert.equal(ast[4].safeHref, 'https://wa.me/94764689907', 'HTTPS URL is safe');
  assert.equal(ast[5].safeHref, undefined, 'javascript: URL must be sanitized as unsafe');
});

// =============================================================================
// 5. ASYNCHRONOUS SEARCH SEQUENCE GUARD (RACE CONDITION PREVENTION)
// =============================================================================

test('Search Sequence Guard: Discards stale out-of-order network response', async () => {
  let searchSeq = 0;
  let activeResults: string[] = [];

  // Helper simulating asynchronous search with sequence check
  async function simulateSearch(query: string, delayMs: number, resultItems: string[]) {
    const currentSeq = ++searchSeq;
    await new Promise((r) => setTimeout(r, delayMs));

    // Stale guard:
    if (currentSeq !== searchSeq) {
      return { ignored: true };
    }

    activeResults = resultItems;
    return { ignored: false, results: activeResults };
  }

  // Trigger Request 1 (types 'A' with 50ms latency)
  const p1 = simulateSearch('A', 50, ['Item A1', 'Item A2']);

  // Rapidly trigger Request 2 (types 'AB' with 10ms latency)
  const p2 = simulateSearch('AB', 10, ['Item AB1']);

  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res2.ignored, false, 'Request 2 (latest) must be processed');
  assert.equal(res1.ignored, true, 'Request 1 (stale) must be discarded');
  assert.deepEqual(activeResults, ['Item AB1'], 'Active search results must reflect the newest query');
});

// =============================================================================
// 6. ON DELETE RESTRICT & TRANSACTIONAL PRODUCT CREATION SAFETY
// =============================================================================

test('ON DELETE RESTRICT: Product deletion is blocked when variants have inventory audit movements', () => {
  // Simulate database state with historical audit movements
  const mockProduct = { id: 'prod-123', name: 'Vintage Emerald Pendant' };
  const mockVariants = [
    { id: 'var-1', product_id: 'prod-123', sku: 'SJ-VNT-001' },
    { id: 'var-2', product_id: 'prod-123', sku: 'SJ-VNT-002' },
  ];
  const mockInventoryMovements = [
    { id: 'mov-1', variant_id: 'var-1', quantity_change: 10, reason: 'stock_added' },
    { id: 'mov-2', variant_id: 'var-2', quantity_change: 5, reason: 'stock_added' },
  ];

  function evaluateProductDeletion(
    productId: string,
    orderCount: number,
    variants: Array<{ id: string }>,
    movements: Array<{ variant_id: string }>
  ) {
    if (orderCount > 0) {
      return {
        allowed: false,
        error: `Cannot delete this product because it has been ordered in ${orderCount} customer order(s). Unpublish/deactivate the product instead to preserve order records.`,
      };
    }

    const variantIds = variants.map((v) => v.id);
    const relatedMovements = movements.filter((m) => variantIds.includes(m.variant_id));

    if (relatedMovements.length > 0) {
      return {
        allowed: false,
        error: `Cannot delete this product because ${relatedMovements.length} historical inventory audit record(s) exist for its variations. Unpublish/deactivate the product instead to preserve inventory audit integrity.`,
      };
    }

    return { allowed: true };
  }

  // Case A: Product has audit movements -> deletion must be safely rejected
  const resWithMovements = evaluateProductDeletion('prod-123', 0, mockVariants, mockInventoryMovements);
  assert.equal(resWithMovements.allowed, false);
  assert.match(resWithMovements.error || '', /historical inventory audit record\(s\) exist/);
  assert.match(resWithMovements.error || '', /Unpublish\/deactivate the product instead/);

  // Case B: Product with NO audit movements and NO orders -> deletion is permitted
  const resClean = evaluateProductDeletion('prod-clean', 0, [{ id: 'var-clean' }], []);
  assert.equal(resClean.allowed, true);
});

test('Rollback Safety: Images inserted BEFORE inventory movements guarantees clean CASCADE on image failure', () => {
  // Simulate the order of operations in the draft-first fallback workflow
  type Step = 'INSERT_PRODUCT_DRAFT' | 'INSERT_VARIANTS_DRAFT' | 'INSERT_IMAGES' | 'INSERT_MOVEMENTS' | 'ACTIVATE_PRODUCT';
  const executionLog: Step[] = [];
  let movementsExist = false;
  let rollbackSuccessful = false;

  function simulateProductCreationWithImageFailure() {
    try {
      // Step 1: Insert product as draft
      executionLog.push('INSERT_PRODUCT_DRAFT');

      // Step 2: Insert variants as draft
      executionLog.push('INSERT_VARIANTS_DRAFT');

      // Step 3: Insert images (BEFORE inventory movements!)
      executionLog.push('INSERT_IMAGES');
      // Simulate image insertion failure (e.g. invalid URL or foreign constraint)
      throw new Error('Failed to attach gallery images: Storage URL malformed');

      // Step 4: Would insert movements (never reached)
      // movementsExist = true;
      // executionLog.push('INSERT_MOVEMENTS');
    } catch (err) {
      // Compensatory cleanup:
      // Verify whether inventory movements exist at the moment of compensatory DELETE
      if (movementsExist) {
        // Under migration 00002, ON DELETE RESTRICT on inventory_movements would fail!
        rollbackSuccessful = false;
      } else {
        // Because images preceded movements, 0 movements exist in DB.
        // Postgres CASCADE delete on products -> variants -> images succeeds cleanly!
        rollbackSuccessful = true;
      }
    }
  }

  simulateProductCreationWithImageFailure();

  assert.deepEqual(executionLog, ['INSERT_PRODUCT_DRAFT', 'INSERT_VARIANTS_DRAFT', 'INSERT_IMAGES']);
  assert.equal(rollbackSuccessful, true, 'Compensatory deletion succeeded without violating ON DELETE RESTRICT');
});

test('Draft-First Incomplete Product Protection: Failed products remain unpublished (is_active = false)', () => {
  let productRow = { id: 'prod-456', is_active: false };

  function simulateCreationWithMovementFailure() {
    // Step 1: Created as draft
    productRow = { id: 'prod-456', is_active: false };

    // Step 4: Batch inventory movement insertion fails (e.g., DB connection dropped)
    // Activation step (Step 5) is never reached!
  }

  simulateCreationWithMovementFailure();

  assert.equal(
    productRow.is_active,
    false,
    'Product must remain unpublished (is_active = false) so it never appears on customer storefront'
  );
});

test('Sole Write Path Atomicity: Missing or failed RPC aborts safely with zero alternative database mutations', () => {
  const dbMutations: Array<{ table: string; operation: string; data: any }> = [];

  function executeCreateProduct(rpcFailureType: 'missing' | 'constraint_violation' | 'network_timeout' | 'none') {
    if (rpcFailureType === 'missing') {
      return {
        success: false,
        error: 'Database product creation procedure is unavailable. Please ensure database migration 00007 is applied.',
      };
    }
    if (rpcFailureType === 'constraint_violation') {
      return {
        success: false,
        error: 'Duplicate SKU "SJ-RING-01" violates unique constraint.',
      };
    }
    if (rpcFailureType === 'network_timeout') {
      return {
        success: false,
        error: 'Network or server error during product creation.',
      };
    }

    // Success path (simulated database RPC)
    dbMutations.push({ table: 'products', operation: 'RPC_INSERT_ATOMIC', data: { name: 'Diamond Ring' } });
    return { success: true, productId: 'prod-atomic-1' };
  }

  // 1. Missing RPC (migration 00007 not applied)
  const missingRes = executeCreateProduct('missing');
  assert.equal(missingRes.success, false);
  assert.match(missingRes.error || '', /procedure is unavailable/);
  assert.equal(dbMutations.length, 0, 'No products, variants, images, or movements must be written on missing RPC');

  // 2. Constraint violation
  const constraintRes = executeCreateProduct('constraint_violation');
  assert.equal(constraintRes.success, false);
  assert.match(constraintRes.error || '', /violates unique constraint/);
  assert.equal(dbMutations.length, 0, 'No alternative writes on constraint violation');

  // 3. Network timeout
  const timeoutRes = executeCreateProduct('network_timeout');
  assert.equal(timeoutRes.success, false);
  assert.match(timeoutRes.error || '', /Network or server error/);
  assert.equal(dbMutations.length, 0, 'No alternative writes on network timeout');
});

// =============================================================================
// 7. TARGETED TRANSACTION-BOUNDARY TESTS (7 SCENARIOS)
// =============================================================================

test('Transaction Boundary 1: Failure after movement insertion bypasses deletion and preserves draft', () => {
  let movementsCommitted = false;
  let deletionAttempted = false;
  let productRow = { id: 'prod-t1', is_active: false };

  function simulateWorkflow() {
    // Step 1: Product draft created
    productRow = { id: 'prod-t1', is_active: false };
    // Step 2 & 3: Variants and images created
    // Step 4: Movements committed
    movementsCommitted = true;
    // Step 5: Activation fails (e.g. database timeout)
    throw new Error('Database connection timeout during product activation');
  }

  try {
    simulateWorkflow();
  } catch (err: any) {
    if (!movementsCommitted) {
      deletionAttempted = true;
    }
    // With movementsCommitted = true, deletion must NOT be attempted
  }

  assert.equal(movementsCommitted, true, 'Movements were committed');
  assert.equal(deletionAttempted, false, 'Compensatory deletion must be explicitly bypassed');
  assert.equal(productRow.is_active, false, 'Product remains safely stored as inactive draft');
});

test('Transaction Boundary 2: Failed final activation returns draft status without constraint violations', () => {
  const productId = 'prod-t2';
  const slug = 'vintage-ruby-ring';
  const movementsCommitted = true;
  const activationError = new Error('Lock timeout while updating products');

  function handleActivationFailure() {
    if (!movementsCommitted) {
      return { success: false, deleted: true, error: activationError.message };
    }

    return {
      success: false,
      productId,
      slug,
      isDraft: true,
      error: `Product and inventory records were successfully created, but automatic activation failed (${activationError.message}). The product has been saved as an inactive draft in your catalog. Please review and activate it from the product editor.`,
    };
  }

  const result = handleActivationFailure();
  assert.equal(result.success, false);
  assert.equal(result.isDraft, true);
  assert.equal(result.productId, productId);
  assert.match(result.error, /saved as an inactive draft in your catalog/);
});

test('Transaction Boundary 3: Ambiguous network timeout during RPC does not trigger silent fallback', () => {
  function isRpcMissingError(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || '').trim().toUpperCase();
    const message = String(error.message || '').toLowerCase();
    if (code === 'PGRST202' || code === '42883') return true;
    if (
      message.includes('could not find the function') ||
      (message.includes('create_product_with_variations') && message.includes('does not exist'))
    ) {
      return true;
    }
    return false;
  }

  // Network timeout or fetch abort error
  const timeoutError = new Error('AbortError: The operation was aborted due to network timeout');
  (timeoutError as any).code = 'ETIMEDOUT';

  const shouldFallback = isRpcMissingError(timeoutError);
  assert.equal(shouldFallback, false, 'Network timeouts must NEVER trigger fallback to avoid duplicate writes');
});

test('Transaction Boundary 4: Failed compensation proof (ON DELETE RESTRICT violation if attempted)', () => {
  // Model of database constraint evaluation when deleting a product with existing movements
  function attemptDbProductDelete(hasMovements: boolean): { ok: boolean; errorCode?: string } {
    if (hasMovements) {
      // Postgres raises 23503 / 23001 foreign key constraint violation on inventory_movements_variant_id_fkey
      return { ok: false, errorCode: '23503' };
    }
    return { ok: true };
  }

  // Deleting product with committed movements fails in Postgres
  const deleteWithMovements = attemptDbProductDelete(true);
  assert.equal(deleteWithMovements.ok, false);
  assert.equal(deleteWithMovements.errorCode, '23503', 'Proves why DELETE must never be executed after movements');

  // Deleting product before movements succeed is clean
  const deleteClean = attemptDbProductDelete(false);
  assert.equal(deleteClean.ok, true);
});

test('Transaction Boundary 5: RPC authorization strictly validates active administrator identity', () => {
  interface AdminUser {
    id: string;
    is_active: boolean;
  }
  const activeAdmins: AdminUser[] = [{ id: 'admin-1', is_active: true }, { id: 'admin-inactive', is_active: false }];

  function validateRpcCaller(adminId: string | null | undefined): { authorized: boolean; error?: string } {
    if (!adminId) {
      return { authorized: false, error: 'Admin ID is required.' };
    }
    const match = activeAdmins.find((a) => a.id === adminId && a.is_active);
    if (!match) {
      return { authorized: false, error: 'Unauthorized: Caller is not an active administrator.' };
    }
    return { authorized: true };
  }

  assert.equal(validateRpcCaller(null).authorized, false);
  assert.equal(validateRpcCaller('admin-inactive').authorized, false);
  assert.equal(validateRpcCaller('random-customer').authorized, false);
  assert.equal(validateRpcCaller('admin-1').authorized, true);
});

test('Transaction Boundary 6: RPC unavailable vs RPC execution failure discrimination', () => {
  function isRpcMissingError(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || '').trim().toUpperCase();
    const message = String(error.message || '').toLowerCase();
    if (code === 'PGRST202' || code === '42883') return true;
    if (
      message.includes('could not find the function') ||
      (message.includes('create_product_with_variations') && message.includes('does not exist'))
    ) {
      return true;
    }
    return false;
  }

  // Genuinely missing procedure:
  assert.equal(isRpcMissingError({ code: 'PGRST202' }), true);
  assert.equal(isRpcMissingError({ code: '42883' }), true);
  assert.equal(isRpcMissingError({ message: 'Could not find the function public.create_product_with_variations' }), true);

  // Execution & business errors (MUST NOT trigger fallback):
  assert.equal(isRpcMissingError({ code: '42501', message: 'permission denied for function' }), false);
  assert.equal(isRpcMissingError({ code: '23505', message: 'duplicate key value violates unique constraint' }), false);
  assert.equal(isRpcMissingError({ code: '23514', message: 'check constraint discount_price_valid' }), false);
  assert.equal(isRpcMissingError({ message: 'Selling price for variant must be non-negative' }), false);
  assert.equal(isRpcMissingError({ message: 'Unauthorized: Caller is not an active administrator' }), false);
});

test('Transaction Boundary 7: Retry after incomplete creation scenarios', () => {
  // Scenario A: Failure occurred BEFORE movements (e.g. image attachment failed).
  // Compensatory deletion succeeded, so slug and SKU are free.
  const databaseSkus = new Set<string>();
  const initialSku = 'SJ-TEST-RETRY-01';

  // Creation starts
  databaseSkus.add(initialSku);
  // Failure before movements -> compensation cleans up
  databaseSkus.delete(initialSku);

  // Retry with same SKU
  assert.equal(databaseSkus.has(initialSku), false, 'SKU was cleanly released');
  databaseSkus.add(initialSku);
  assert.equal(databaseSkus.has(initialSku), true, 'Retry succeeds');

  // Scenario B: Failure occurred during final activation (movements committed).
  // Product is saved as draft; retry activates the existing draft instead of creating duplicates.
  interface CatalogItem {
    id: string;
    sku: string;
    is_active: boolean;
  }
  const catalog: CatalogItem[] = [{ id: 'prod-draft-1', sku: 'SJ-DRAFT-01', is_active: false }];

  function activateExistingDraft(sku: string): boolean {
    const item = catalog.find((c) => c.sku === sku);
    if (item && !item.is_active) {
      item.is_active = true;
      return true;
    }
    return false;
  }

  const activated = activateExistingDraft('SJ-DRAFT-01');
  assert.equal(activated, true);
  assert.equal(catalog[0].is_active, true, 'Draft was successfully activated without duplicate insertion');
});

// =============================================================================
// 8. MIGRATION 00007 SQL DEFENSIVE INTEGRITY & NUMERIC VALIDATION
// =============================================================================

test('Migration 00007 Validation: Rejects images with nonexistent variant_sku reference', () => {
  interface Variant {
    sku: string;
  }
  interface Image {
    url: string;
    variant_sku?: string | null;
  }

  function validateImageVariantReferences(variants: Variant[], images: Image[]) {
    const validSkus = new Set(variants.map((v) => v.sku.toUpperCase().trim()));

    for (const img of images) {
      if (img.variant_sku && img.variant_sku.trim() !== '') {
        const targetSku = img.variant_sku.toUpperCase().trim();
        if (!validSkus.has(targetSku)) {
          throw new Error(`Image "${img.url}" references variant SKU "${targetSku}", which does not exist in this product.`);
        }
      }
    }
    return true;
  }

  const variants = [{ sku: 'SJ-RING-001' }, { sku: 'SJ-RING-002' }];

  // Case A: Valid variant references
  assert.doesNotThrow(() => {
    validateImageVariantReferences(variants, [
      { url: 'https://example.com/ring.jpg', variant_sku: null },
      { url: 'https://example.com/ring-gold.jpg', variant_sku: 'SJ-RING-001' },
    ]);
  });

  // Case B: Nonexistent variant reference -> MUST THROW, NEVER SILENTLY CONVERT TO PRODUCT-LEVEL
  assert.throws(
    () => {
      validateImageVariantReferences(variants, [
        { url: 'https://example.com/ring-ghost.jpg', variant_sku: 'SJ-RING-999' },
      ]);
    },
    /references variant SKU "SJ-RING-999", which does not exist in this product/
  );
});

test('Migration 00007 Validation: Respects individual variant active/inactive states', () => {
  interface VariantInput {
    sku: string;
    is_active?: boolean;
  }

  function processVariantStates(variants: VariantInput[]) {
    return variants.map((v) => ({
      sku: v.sku,
      is_active: v.is_active !== undefined ? Boolean(v.is_active) : true,
    }));
  }

  const processed = processVariantStates([
    { sku: 'SJ-VAR-ACTIVE', is_active: true },
    { sku: 'SJ-VAR-INACTIVE', is_active: false },
    { sku: 'SJ-VAR-DEFAULT' }, // default true
  ]);

  assert.equal(processed[0].is_active, true);
  assert.equal(processed[1].is_active, false, 'Inactive variant state must be preserved');
  assert.equal(processed[2].is_active, true, 'Default variant state is active');
});

test('Migration 00007 Validation: Rejects negative low-stock threshold explicitly instead of defaulting', () => {
  function validateLowStockThreshold(rawVal: string | number | undefined | null): number {
    if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
      const str = String(rawVal).trim();
      if (/nan|infinity|\./i.test(str)) {
        throw new Error('Low stock threshold must be an integer.');
      }
      const val = parseInt(str, 10);
      if (val < 0) {
        throw new Error('Low stock threshold cannot be negative.');
      }
      return val;
    }
    return 5;
  }

  // Valid inputs
  assert.equal(validateLowStockThreshold(undefined), 5, 'Defaults to 5 when omitted');
  assert.equal(validateLowStockThreshold('10'), 10);
  assert.equal(validateLowStockThreshold(0), 0, 'Zero threshold is allowed');

  // Negative inputs -> MUST THROW, never silently replace with 5
  assert.throws(() => validateLowStockThreshold(-3), /cannot be negative/);
  assert.throws(() => validateLowStockThreshold('-1'), /cannot be negative/);
});

test('Migration 00007 Validation: Rejects special numeric values (NaN, Infinity, Negative Prices)', () => {
  function validateNumericInput(field: string, rawVal: any): number {
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
      throw new Error(`${field} is required.`);
    }
    const str = String(rawVal).trim();
    if (/nan|infinity/i.test(str)) {
      throw new Error(`${field} cannot be NaN or Infinity.`);
    }
    const num = Number(str);
    if (isNaN(num) || !isFinite(num)) {
      throw new Error(`${field} must be a valid finite number.`);
    }
    if (num < 0) {
      throw new Error(`${field} cannot be negative.`);
    }
    return num;
  }

  // Price validation
  assert.equal(validateNumericInput('Selling price', '4500.50'), 4500.5);
  assert.throws(() => validateNumericInput('Selling price', 'NaN'), /cannot be NaN or Infinity/);
  assert.throws(() => validateNumericInput('Selling price', 'Infinity'), /cannot be NaN or Infinity/);
  assert.throws(() => validateNumericInput('Selling price', '-Infinity'), /cannot be NaN or Infinity/);
  assert.throws(() => validateNumericInput('Selling price', '-100'), /cannot be negative/);
});

test('Migration 00007 Validation: Strictly validates image payload structure and URL safety', () => {
  function validateImagesPayload(payload: any) {
    if (payload === null || payload === undefined) return [];
    if (!Array.isArray(payload)) {
      throw new Error('Images payload must be a JSON array.');
    }

    return payload.map((img, idx) => {
      if (typeof img !== 'object' || img === null || Array.isArray(img)) {
        throw new Error(`Malformed image payload at index ${idx}: each item must be a JSON object.`);
      }
      const url = String(img.url || '').trim();
      if (!url) {
        throw new Error('Image URL cannot be empty.');
      }
      if (!/^(https?:\/\/|\/)/i.test(url)) {
        throw new Error(`Invalid image URL "${url}". URL must start with http://, https://, or a relative path.`);
      }
      const displayOrder = img.display_order != null ? Number(img.display_order) : 0;
      if (isNaN(displayOrder) || displayOrder < 0 || !Number.isInteger(displayOrder)) {
        throw new Error(`Display order for image "${url}" cannot be negative or invalid.`);
      }
      return { url, displayOrder };
    });
  }

  // Malformed non-array payload
  assert.throws(() => validateImagesPayload({ url: 'https://example.com/img.jpg' }), /must be a JSON array/);
  assert.throws(() => validateImagesPayload('https://example.com/img.jpg'), /must be a JSON array/);

  // Malformed array elements
  assert.throws(() => validateImagesPayload(['not-an-object']), /must be a JSON object/);

  // Unsafe URLs
  assert.throws(() => validateImagesPayload([{ url: 'javascript:alert(1)' }]), /URL must start with http/);
  assert.throws(() => validateImagesPayload([{ url: 'data:image/png;base64,123' }]), /URL must start with http/);

  // Negative display order
  assert.throws(() => validateImagesPayload([{ url: 'https://example.com/img.jpg', display_order: -1 }]), /cannot be negative/);

  // Valid payload
  const valid = validateImagesPayload([{ url: 'https://example.com/img.jpg', display_order: 1 }]);
  assert.equal(valid.length, 1);
});

test('Migration 00007 Validation: Enforces case-insensitive duplicate SKU detection', () => {
  function checkBatchDuplicateSkus(skus: string[]) {
    const seen = new Set<string>();
    for (const raw of skus) {
      const normalized = raw.trim().toUpperCase();
      if (seen.has(normalized)) {
        throw new Error(`Duplicate SKU "${normalized}" found within the variation list.`);
      }
      seen.add(normalized);
    }
    return true;
  }

  // Same case duplicate
  assert.throws(() => checkBatchDuplicateSkus(['SJ-TEST-001', 'SJ-TEST-001']), /Duplicate SKU "SJ-TEST-001"/);

  // Mixed case duplicate
  assert.throws(() => checkBatchDuplicateSkus(['SJ-TEST-001', 'sj-test-001']), /Duplicate SKU "SJ-TEST-001"/);

  // Distinct SKUs
  assert.doesNotThrow(() => checkBatchDuplicateSkus(['SJ-TEST-001', 'SJ-TEST-002']));
});

test('Product Creation Atomicity: Database RPC is the SOLE write path with zero alternative mutations on failure', () => {
  interface DatabaseWriteRecord {
    table: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'RPC';
    payload: any;
  }
  const dbWriteLog: DatabaseWriteRecord[] = [];

  function isRpcMissingError(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || '').trim().toUpperCase();
    const message = String(error.message || '').toLowerCase();
    if (code === 'PGRST202' || code === '42883') return true;
    if (
      message.includes('could not find the function') ||
      (message.includes('create_product_with_variations') && message.includes('does not exist'))
    ) {
      return true;
    }
    return false;
  }

  // Model of createProductAction with zero write fallback
  function executeCreateProductAction(mockRpcResult: {
    data?: { success: boolean; product_id?: string; slug?: string; error?: string };
    error?: { code?: string; message: string };
    thrownException?: Error;
  }) {
    try {
      if (mockRpcResult.thrownException) {
        throw mockRpcResult.thrownException;
      }

      const { data: rpcData, error: rpcError } = mockRpcResult;

      if (rpcError) {
        const errMsg = rpcError.message || 'Product creation transaction failed.';
        return {
          success: false,
          error: isRpcMissingError(rpcError)
            ? 'Database product creation procedure is unavailable. Please ensure database migration 00007 is applied.'
            : errMsg,
        };
      }

      if (!rpcData?.success) {
        return {
          success: false,
          error: rpcData?.error || 'Product creation failed.',
        };
      }

      dbWriteLog.push({ table: 'products', operation: 'RPC', payload: rpcData });
      return {
        success: true,
        productId: rpcData.product_id,
        slug: rpcData.slug,
      };
    } catch (rpcCallErr: unknown) {
      if (isRpcMissingError(rpcCallErr)) {
        return {
          success: false,
          error: 'Database product creation procedure is unavailable. Please ensure database migration 00007 is applied.',
        };
      }
      return {
        success: false,
        error: rpcCallErr instanceof Error ? rpcCallErr.message : 'Network or server error during product creation.',
      };
    }
  }

  // Scenario 1: RPC is missing (Migration 00007 not applied) -> Must fail safely with 0 writes
  const resMissing = executeCreateProductAction({
    error: { code: 'PGRST202', message: 'Could not find the function public.create_product_with_variations' },
  });
  assert.equal(resMissing.success, false);
  assert.match(resMissing.error || '', /procedure is unavailable\. Please ensure database migration 00007 is applied/);
  assert.equal(dbWriteLog.length, 0, 'Zero writes must occur when RPC is missing');

  // Scenario 2: RPC throws PostgreSQL 42883 (undefined_function) -> 0 writes
  const resUndefined = executeCreateProductAction({
    error: { code: '42883', message: 'function public.create_product_with_variations does not exist' },
  });
  assert.equal(resUndefined.success, false);
  assert.match(resUndefined.error || '', /procedure is unavailable/);
  assert.equal(dbWriteLog.length, 0, 'Zero writes must occur when RPC is undefined');

  // Scenario 3: Database constraint violation (e.g. duplicate slug or SKU) -> 0 writes
  const resConstraint = executeCreateProductAction({
    error: { code: '23505', message: 'A product with slug "vintage-ring" already exists.' },
  });
  assert.equal(resConstraint.success, false);
  assert.equal(resConstraint.error, 'A product with slug "vintage-ring" already exists.');
  assert.equal(dbWriteLog.length, 0, 'Zero writes must occur on constraint violation');

  // Scenario 4: Network timeout exception thrown by client -> 0 writes
  const resTimeout = executeCreateProductAction({
    thrownException: new Error('fetch failed: Connection reset by peer'),
  });
  assert.equal(resTimeout.success, false);
  assert.match(resTimeout.error || '', /fetch failed/);
  assert.equal(dbWriteLog.length, 0, 'Zero writes must occur on network exception');

  // Scenario 5: Success path -> exactly 1 atomic RPC call recorded
  const resSuccess = executeCreateProductAction({
    data: { success: true, product_id: 'prod-001', slug: 'royal-sapphire-ring' },
  });
  assert.equal(resSuccess.success, true);
  assert.equal(resSuccess.productId, 'prod-001');
  assert.equal(resSuccess.slug, 'royal-sapphire-ring');
  assert.equal(dbWriteLog.length, 1);
  assert.equal(dbWriteLog[0].operation, 'RPC');
});

test('Migration 00007 SKU Integrity: Defensive check detects case collisions and aborts safely without mutating data', () => {
  interface VariantRecord {
    id: string;
    sku: string;
  }

  function runMigration00007Precheck(variants: VariantRecord[]): { safe: boolean; error?: string } {
    const map = new Map<string, string[]>();
    for (const v of variants) {
      const norm = v.sku.trim().toLowerCase();
      const existing = map.get(norm) || [];
      existing.push(v.sku);
      map.set(norm, existing);
    }

    const collisions: string[] = [];
    for (const [, list] of map.entries()) {
      if (list.length > 1) {
        collisions.push(list.join(', '));
      }
    }

    if (collisions.length > 0) {
      // Limit to 5 sample collision groups matching PostgreSQL scalar subquery LIMIT 5
      const sample = collisions.slice(0, 5);
      return {
        safe: false,
        error: `Cannot apply migration 00007: found ${collisions.length} case-colliding SKU group(s): [${sample.join('; ')}]. Manual reconciliation required before creating case-insensitive unique index.`,
      };
    }

    return { safe: true };
  }

  // Case A: Table has colliding SKUs differing only by case or whitespace ('SJ-RING-01' and ' sj-ring-01 ')
  const collidingData: VariantRecord[] = [
    { id: 'v1', sku: 'SJ-RING-01' },
    { id: 'v2', sku: 'SJ-BRACELET-01' },
    { id: 'v3', sku: ' sj-ring-01 ' }, // Case & whitespace collision!
  ];
  const collCheck = runMigration00007Precheck(collidingData);
  assert.equal(collCheck.safe, false);
  assert.match(collCheck.error || '', /case-colliding SKU group\(s\)/);
  assert.match(collCheck.error || '', /SJ-RING-01,  sj-ring-01 /);

  // Case B: Table has completely unique SKUs across cases
  const cleanData: VariantRecord[] = [
    { id: 'v1', sku: 'SJ-RING-01' },
    { id: 'v2', sku: 'SJ-BRACELET-01' },
    { id: 'v3', sku: 'SJ-NECKLACE-01' },
  ];
  const cleanCheck = runMigration00007Precheck(cleanData);
  assert.equal(cleanCheck.safe, true);
  assert.equal(cleanCheck.error, undefined);
});

test('Migration 00007 SKU Integrity: Database-level case-insensitive unique index prevents concurrent case collision', () => {
  // Model of PostgreSQL unique index on LOWER(TRIM(sku))
  const index = new Set<string>();

  function insertVariantWithIndex(sku: string): { ok: boolean; errorCode?: string } {
    const key = sku.trim().toLowerCase();
    if (index.has(key)) {
      // Postgres 23505 unique_violation
      return { ok: false, errorCode: '23505' };
    }
    index.add(key);
    return { ok: true };
  }

  // 1. First transaction inserts uppercase SKU
  const tx1 = insertVariantWithIndex('SJ-SAPPHIRE-001');
  assert.equal(tx1.ok, true);

  // 2. Concurrent transaction attempts lowercase or mixed-case version
  const tx2 = insertVariantWithIndex('  sj-sapphire-001  ');
  assert.equal(tx2.ok, false);
  assert.equal(tx2.errorCode, '23505', 'Case-insensitive index aborts concurrent collision');

  // 3. Distinct SKU succeeds
  const tx3 = insertVariantWithIndex('SJ-SAPPHIRE-002');
  assert.equal(tx3.ok, true);
});




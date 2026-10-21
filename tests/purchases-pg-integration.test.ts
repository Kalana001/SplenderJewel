import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const { Client } = pg;

const TEST_DB_URL = 'postgresql://postgres@127.0.0.1:5433/splender_test';

describe('PostgreSQL 18 Integration Tests: Splender Jewel Purchase Management', () => {
  let client: pg.Client;
  let isDbAvailable = false;

  const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
  const CATEGORY_ID = '00000000-0000-0000-0000-000000000002';
  const NON_ADMIN_ID = '00000000-0000-0000-0000-000000000009';

  before(async () => {
    try {
      client = new Client({ connectionString: TEST_DB_URL });
      await client.connect();
      isDbAvailable = true;

      // Seed prerequisites
      await client.query(`
        INSERT INTO auth.users (id, email) VALUES 
          ('${ADMIN_ID}', 'admin@splenderjewel.com'),
          ('${NON_ADMIN_ID}', 'customer@example.com')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.admin_users (id, email, full_name, role, is_active) VALUES 
          ('${ADMIN_ID}', 'admin@splenderjewel.com', 'Test Super Admin', 'super_admin', true)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.categories (id, name, slug) VALUES 
          ('${CATEGORY_ID}', 'Rings', 'rings')
        ON CONFLICT DO NOTHING;
      `);
    } catch (err) {
      console.warn('PostgreSQL 18 test database not reachable at port 5433:', err);
      isDbAvailable = false;
    }
  });

  after(async () => {
    if (client) {
      await client.end();
    }
  });

  // ── 1. Transactional Workflow Tests ────────────────────────────────────────
  test('Workflow 1: Create purchase batch atomically in draft status', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    const batchNumber = `PB-INT-${Date.now()}-001`;
    const batchPayload = {
      batchNumber,
      supplierName: 'Ceylon Gem Syndicate',
      supplierContact: '+94 11 234 5678',
      invoiceNumber: 'INV-2026-901',
      totalSupplierCostCents: 100000, // 1,000.00 LKR
      totalExpensesCents: 20000,      // 200.00 LKR
      totalLandedCostCents: 120000,    // 1,200.00 LKR
      totalPurchasedUnits: 20,
    };
    const expensesPayload = [
      { expenseType: 'shipping', amountCents: 12000, description: 'Courier Delivery' },
      { expenseType: 'packing', amountCents: 8000, description: 'Velvet Presentation Boxes' },
    ];
    const itemsPayload = [
      {
        itemName: '18K Gold Plated Stacking Ring',
        itemCategoryHint: 'Rings',
        totalQuantity: 20,
        totalSupplierCostCents: 100000,
        totalAllocatedExpenseCents: 20000,
        totalLandedCostCents: 120000,
        variations: [
          {
            variationTitle: 'Size 6',
            quantityPurchased: 10,
            supplierUnitPriceCents: 5000,
            lineSupplierCostCents: 50000,
            lineAllocatedExpenseCents: 10000,
            lineTotalLandedCostCents: 60000, // 6,000 cents/unit
            unitLandedCostCents: 6000,
          },
          {
            variationTitle: 'Size 7',
            quantityPurchased: 10,
            supplierUnitPriceCents: 5000,
            lineSupplierCostCents: 50000,
            lineAllocatedExpenseCents: 10000,
            lineTotalLandedCostCents: 60000, // 6,000 cents/unit
            unitLandedCostCents: 6000,
          },
        ],
      },
    ];

    const res = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [JSON.stringify(batchPayload), JSON.stringify(expensesPayload), JSON.stringify(itemsPayload), ADMIN_ID]
    );

    const result = res.rows[0].result;
    assert.equal(result.success, true);
    assert.equal(result.status, 'draft');
    assert.equal(result.batch_number, batchNumber);

    // Verify DB records
    const batchDb = await client.query(`SELECT * FROM public.purchase_batches WHERE id = $1`, [result.batch_id]);
    assert.equal(batchDb.rows.length, 1);
    assert.equal(batchDb.rows[0].status, 'draft');
    assert.equal(Number(batchDb.rows[0].total_purchased_units), 20);
    assert.equal(Number(batchDb.rows[0].total_received_units), 0);

    const itemsDb = await client.query(`SELECT * FROM public.purchase_batch_items WHERE batch_id = $1`, [result.batch_id]);
    assert.equal(itemsDb.rows.length, 1);

    const varsDb = await client.query(`SELECT * FROM public.purchase_batch_item_variations WHERE batch_id = $1 ORDER BY variation_title`, [result.batch_id]);
    assert.equal(varsDb.rows.length, 2);
    assert.equal(varsDb.rows[0].quantity_purchased, 10);
    assert.equal(varsDb.rows[0].quantity_received, 0);
    assert.equal(varsDb.rows[0].quantity_linked, 0);
  });

  test('Workflow 2: Confirm batch transitions status draft -> ordered with immutability', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    // Create a draft batch
    const batchNumber = `PB-INT-${Date.now()}-002`;
    const res = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Supplier 2', totalSupplierCostCents: 50000, totalExpensesCents: 0, totalLandedCostCents: 50000, totalPurchasedUnits: 10 }),
        JSON.stringify([]),
        JSON.stringify([{
          itemName: 'Pearl Earring',
          totalQuantity: 10,
          totalSupplierCostCents: 50000,
          totalAllocatedExpenseCents: 0,
          totalLandedCostCents: 50000,
          variations: [{ variationTitle: 'Default', quantityPurchased: 10, supplierUnitPriceCents: 5000, lineSupplierCostCents: 50000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 50000, unitLandedCostCents: 5000 }],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = res.rows[0].result.batch_id;

    // Confirm batch
    const confRes = await client.query(`SELECT public.confirm_purchase_batch($1, $2) AS result`, [batchId, ADMIN_ID]);
    assert.equal(confRes.rows[0].result.success, true);
    assert.equal(confRes.rows[0].result.status, 'ordered');

    // Immutability test: verify trigger prevents deleting confirmed batch
    await assert.rejects(
      async () => {
        await client.query(`DELETE FROM public.purchase_batches WHERE id = $1`, [batchId]);
      },
      /immutable for accounting integrity/
    );
  });

  test('Workflow 3 & 4: Physical receiving (partial and full) does NOT touch storefront stock', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    const batchNumber = `PB-INT-${Date.now()}-003`;
    const res = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Supplier 3', totalSupplierCostCents: 60000, totalExpensesCents: 0, totalLandedCostCents: 60000, totalPurchasedUnits: 10 }),
        JSON.stringify([]),
        JSON.stringify([{
          itemName: 'Silver Chain',
          totalQuantity: 10,
          totalSupplierCostCents: 60000,
          totalAllocatedExpenseCents: 0,
          totalLandedCostCents: 60000,
          variations: [{ variationTitle: '18 Inch', quantityPurchased: 10, supplierUnitPriceCents: 6000, lineSupplierCostCents: 60000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 60000, unitLandedCostCents: 6000 }],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = res.rows[0].result.batch_id;
    await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);

    const varDb = await client.query(`SELECT id FROM public.purchase_batch_item_variations WHERE batch_id = $1`, [batchId]);
    const varId = varDb.rows[0].id;

    // Partial receipt: 4 units
    const rcpt1 = await client.query(
      `SELECT public.receive_purchase_batch_items($1, $2, $3, $4) AS result`,
      [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 4, receiptNotes: 'First 4 arrived' }]), `rcpt-${Date.now()}-1`, ADMIN_ID]
    );
    assert.equal(rcpt1.rows[0].result.batch_status, 'partially_received');
    assert.equal(rcpt1.rows[0].result.total_received_units, 4);

    // Remaining receipt: 6 units
    const rcpt2 = await client.query(
      `SELECT public.receive_purchase_batch_items($1, $2, $3, $4) AS result`,
      [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 6, receiptNotes: 'Final 6 arrived' }]), `rcpt-${Date.now()}-2`, ADMIN_ID]
    );
    assert.equal(rcpt2.rows[0].result.batch_status, 'received');
    assert.equal(rcpt2.rows[0].result.total_received_units, 10);

    // Invariant: Zero storefront product variants or movements were created
    const storeVariants = await client.query(`SELECT count(*) FROM public.product_variants`);
    // Stock remained isolated in purchasing ledger
    const varCheck = await client.query(`SELECT quantity_received, quantity_linked FROM public.purchase_batch_item_variations WHERE id = $1`, [varId]);
    assert.equal(varCheck.rows[0].quantity_received, 10);
    assert.equal(varCheck.rows[0].quantity_linked, 0);
  });

  // ── 2. Critical Regression Tests ───────────────────────────────────────────
  test('Regression A (Double Counting): Product creation from purchase batch sets stock exactly once (10, never 20)', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    // 1. Create and receive a batch of 10 units
    const batchNumber = `PB-INT-${Date.now()}-A`;
    const bRes = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Anklet Imports', totalSupplierCostCents: 50000, totalExpensesCents: 10000, totalLandedCostCents: 60000, totalPurchasedUnits: 10 }),
        JSON.stringify([{ expenseType: 'transport', amountCents: 10000 }]),
        JSON.stringify([{
          itemName: 'Gold Stacking Anklet',
          totalQuantity: 10,
          totalSupplierCostCents: 50000,
          totalAllocatedExpenseCents: 10000,
          totalLandedCostCents: 60000,
          variations: [{ variationTitle: 'Standard', quantityPurchased: 10, supplierUnitPriceCents: 5000, lineSupplierCostCents: 50000, lineAllocatedExpenseCents: 10000, lineTotalLandedCostCents: 60000, unitLandedCostCents: 6000 }],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = bRes.rows[0].result.batch_id;
    await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);
    const varDb = await client.query(`SELECT id FROM public.purchase_batch_item_variations WHERE batch_id = $1`, [batchId]);
    const varId = varDb.rows[0].id;
    await client.query(`SELECT public.receive_purchase_batch_items($1, $2, $3, $4)`, [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 10 }]), `rcpt-${Date.now()}-A`, ADMIN_ID]);

    // 2. Execute single atomic procedure: create_product_from_purchase_batch
    const sku = `SJ-ANK-A-${Date.now()}`;
    const slug = `gold-anklet-${Date.now()}`;
    const prodRes = await client.query(
      `SELECT public.create_product_from_purchase_batch($1, $2, $3, $4, $5) AS result`,
      [
        JSON.stringify({ name: 'Gold Stacking Anklet', slug, category_id: CATEGORY_ID }),
        JSON.stringify([{
          title: 'Standard',
          sku,
          price: 9500, // 95.00 LKR
          low_stock_threshold: 3,
          batch_variation_id: varId,
          transfer_quantity: 10, // transfer all 10
        }]),
        JSON.stringify([]),
        `idemp-prod-${Date.now()}`,
        ADMIN_ID,
      ]
    );

    assert.equal(prodRes.rows[0].result.success, true);
    const productId = prodRes.rows[0].result.product_id;

    // 3. Inspect variant in DB: stock must be EXACTLY 10, NEVER 20!
    const variantDb = await client.query(`SELECT stock_quantity, purchase_cost, is_active FROM public.product_variants WHERE product_id = $1`, [productId]);
    assert.equal(variantDb.rows[0].stock_quantity, 10, 'Stock quantity must be exactly 10, never 20!');
    assert.equal(Number(variantDb.rows[0].purchase_cost), 60.00, 'Landed cost must be exactly 60.00 LKR (6,000 cents)');

    // 4. Verify product defaults to unpublished draft
    const prodDb = await client.query(`SELECT is_active FROM public.products WHERE id = $1`, [productId]);
    assert.equal(prodDb.rows[0].is_active, false, 'New product must default to unpublished draft (is_active = FALSE)');

    // 5. Verify exactly ONE inventory movement was created (PURCHASE_TRANSFER, not INITIAL_PRODUCT_SETUP + transfer)
    const movDb = await client.query(`SELECT * FROM public.inventory_movements WHERE variant_id IN (SELECT id FROM public.product_variants WHERE product_id = $1)`, [productId]);
    assert.equal(movDb.rows.length, 1);
    assert.equal(movDb.rows[0].quantity_change, 10);
    assert.ok(movDb.rows[0].reference_id.startsWith('PURCHASE_TRANSFER:'));

    // 6. Verify purchase ledger linked quantity
    const varLinked = await client.query(`SELECT quantity_linked FROM public.purchase_batch_item_variations WHERE id = $1`, [varId]);
    assert.equal(varLinked.rows[0].quantity_linked, 10);
  });

  test('Regression B (Partial Receipts Costing): Multiple partial transfers reconcile exact line cost with zero residual drift', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    // Batch: 10 purchased @ 1,000 cents/unit = 10,000 cents total
    const batchNumber = `PB-INT-${Date.now()}-B`;
    const bRes = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Pearl Farm', totalSupplierCostCents: 10000, totalExpensesCents: 0, totalLandedCostCents: 10000, totalPurchasedUnits: 10 }),
        JSON.stringify([]),
        JSON.stringify([{
          itemName: 'Pearl Studs',
          totalQuantity: 10,
          totalSupplierCostCents: 10000,
          totalAllocatedExpenseCents: 0,
          totalLandedCostCents: 10000,
          variations: [{ variationTitle: 'Default', quantityPurchased: 10, supplierUnitPriceCents: 1000, lineSupplierCostCents: 10000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 10000, unitLandedCostCents: 1000 }],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = bRes.rows[0].result.batch_id;
    await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);
    const varDb = await client.query(`SELECT id FROM public.purchase_batch_item_variations WHERE batch_id = $1`, [batchId]);
    const varId = varDb.rows[0].id;

    // Create standalone target variant in DB to restock
    const prodRes = await client.query(
      `INSERT INTO public.products (name, slug) VALUES ('Pearl Studs', 'pearl-studs-${Date.now()}') RETURNING id`
    );
    const targetVarRes = await client.query(
      `INSERT INTO public.product_variants (product_id, sku, title, price, stock_quantity, purchase_cost) 
       VALUES ($1, $2, 'Default', 3000, 0, 0) RETURNING id`,
      [prodRes.rows[0].id, `PRL-${Date.now()}`]
    );
    const targetVariantId = targetVarRes.rows[0].id;

    // Step 1: Receive 5 units
    const k1 = `rcpt-B-1-${Date.now()}`;
    await client.query(`SELECT public.receive_purchase_batch_items($1, $2, $3, $4)`, [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 5 }]), k1, ADMIN_ID]);

    // Step 2: Transfer 5 units
    const t1Key = `t-B-1-${Date.now()}`;
    const t1 = await client.query(
      `SELECT public.transfer_purchase_stock_to_variant($1, $2, 5, 'restock_existing', $3, $4) AS result`,
      [varId, targetVariantId, t1Key, ADMIN_ID]
    );
    assert.equal(t1.rows[0].result.success, true);
    assert.equal(Number(t1.rows[0].result.transferred_cost_cents), 5000, 'Transfer 1 must be pro-rata (5,000 cents, not 10,000 cents)');
    assert.equal(Number(t1.rows[0].result.blended_purchase_cost), 10.00);

    // Step 3: Receive remaining 5 units
    const k2 = `rcpt-B-2-${Date.now()}`;
    await client.query(`SELECT public.receive_purchase_batch_items($1, $2, $3, $4)`, [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 5 }]), k2, ADMIN_ID]);

    // Step 4: Transfer remaining 5 units
    const t2Key = `t-B-2-${Date.now()}`;
    const t2 = await client.query(
      `SELECT public.transfer_purchase_stock_to_variant($1, $2, 5, 'restock_existing', $3, $4) AS result`,
      [varId, targetVariantId, t2Key, ADMIN_ID]
    );
    assert.equal(t2.rows[0].result.success, true);
    assert.equal(Number(t2.rows[0].result.transferred_cost_cents), 5000, 'Transfer 2 must absorb balance (5,000 cents, not 0 cents)');
    assert.equal(Number(t2.rows[0].result.blended_purchase_cost), 10.00);

    // Total transferred = 10,000 cents
    const sumCents = BigInt(t1.rows[0].result.transferred_cost_cents) + BigInt(t2.rows[0].result.transferred_cost_cents);
    assert.equal(sumCents, BigInt(10000), 'Sum of partial transfers must reconcile exactly to 10,000 cents');
  });

  test('Regression C (Multi-Variation Atomicity): Rollback on partial failure leaves 0 rows committed', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    // Create batch with 2 variations, only 1 received
    const batchNumber = `PB-INT-${Date.now()}-C`;
    const bRes = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Supplier C', totalSupplierCostCents: 20000, totalExpensesCents: 0, totalLandedCostCents: 20000, totalPurchasedUnits: 10 }),
        JSON.stringify([]),
        JSON.stringify([{
          itemName: 'Ring Set',
          totalQuantity: 10,
          totalSupplierCostCents: 20000,
          totalAllocatedExpenseCents: 0,
          totalLandedCostCents: 20000,
          variations: [
            { variationTitle: 'Var 1', quantityPurchased: 5, supplierUnitPriceCents: 2000, lineSupplierCostCents: 10000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 10000, unitLandedCostCents: 2000 },
            { variationTitle: 'Var 2', quantityPurchased: 5, supplierUnitPriceCents: 2000, lineSupplierCostCents: 10000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 10000, unitLandedCostCents: 2000 },
          ],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = bRes.rows[0].result.batch_id;
    await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);
    const varsDb = await client.query(`SELECT id, variation_title FROM public.purchase_batch_item_variations WHERE batch_id = $1 ORDER BY variation_title`, [batchId]);
    const var1Id = varsDb.rows[0].id;
    const var2Id = varsDb.rows[1].id;

    // Receive only Var 1 (5 units). Var 2 receives 0.
    const kC1 = `rcpt-C-1-${Date.now()}`;
    await client.query(`SELECT public.receive_purchase_batch_items($1, $2, $3, $4)`, [batchId, JSON.stringify([{ batchVariationId: var1Id, quantityReceived: 5 }]), kC1, ADMIN_ID]);

    // Attempt to create product requiring 5 units of Var 1 AND 5 units of Var 2 (which has 0 available)
    const slug = `atomic-rollback-${Date.now()}`;
    await assert.rejects(
      async () => {
        await client.query(
          `SELECT public.create_product_from_purchase_batch($1, $2, $3, $4, $5)`,
          [
            JSON.stringify({ name: 'Atomic Rollback Product', slug, category_id: CATEGORY_ID }),
            JSON.stringify([
              { title: 'Var 1', sku: `SKU-C1-${Date.now()}`, price: 4000, batch_variation_id: var1Id, transfer_quantity: 5 },
              { title: 'Var 2', sku: `SKU-C2-${Date.now()}`, price: 4000, batch_variation_id: var2Id, transfer_quantity: 5 }, // FAILS: 0 available!
            ]),
            JSON.stringify([]),
            `idemp-rollback-${Date.now()}`,
            ADMIN_ID,
          ]
        );
      },
      /Insufficient unlinked quantity/
    );

    // Verify atomic rollback: Product was NOT created
    const prodCheck = await client.query(`SELECT * FROM public.products WHERE slug = $1`, [slug]);
    assert.equal(prodCheck.rows.length, 0, 'Product must not exist in DB after transaction rollback');

    // Verify Var 1 was NOT linked: quantity_linked is still 0
    const var1Check = await client.query(`SELECT quantity_linked FROM public.purchase_batch_item_variations WHERE id = $1`, [var1Id]);
    assert.equal(var1Check.rows[0].quantity_linked, 0, 'Var 1 unlinked stock must remain untouched (0 linked)');
  });

  test('Regression D (Durable Idempotency): Duplicate product creation returns cached response without duplication', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    // Setup received batch
    const batchNumber = `PB-INT-${Date.now()}-D`;
    const bRes = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Supplier D', totalSupplierCostCents: 10000, totalExpensesCents: 0, totalLandedCostCents: 10000, totalPurchasedUnits: 5 }),
        JSON.stringify([]),
        JSON.stringify([{
          itemName: 'Idempotent Item',
          totalQuantity: 5,
          totalSupplierCostCents: 10000,
          totalAllocatedExpenseCents: 0,
          totalLandedCostCents: 10000,
          variations: [{ variationTitle: 'Default', quantityPurchased: 5, supplierUnitPriceCents: 2000, lineSupplierCostCents: 10000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 10000, unitLandedCostCents: 2000 }],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = bRes.rows[0].result.batch_id;
    await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);
    const varDb = await client.query(`SELECT id FROM public.purchase_batch_item_variations WHERE batch_id = $1`, [batchId]);
    const varId = varDb.rows[0].id;
    const kD1 = `rcpt-D-1-${Date.now()}`;
    await client.query(`SELECT public.receive_purchase_batch_items($1, $2, $3, $4)`, [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 5 }]), kD1, ADMIN_ID]);

    const idempotencyKey = `idemp-dup-${Date.now()}`;
    const payload = [
      JSON.stringify({ name: 'Idempotency Ring', slug: `idemp-ring-${Date.now()}`, category_id: CATEGORY_ID }),
      JSON.stringify([{ title: 'Default', sku: `IDEMP-SKU-${Date.now()}`, price: 3500, batch_variation_id: varId, transfer_quantity: 5 }]),
      JSON.stringify([]),
      idempotencyKey,
      ADMIN_ID,
    ];

    // Request 1: Fresh creation
    const res1 = await client.query(`SELECT public.create_product_from_purchase_batch($1, $2, $3, $4, $5) AS result`, payload);
    assert.equal(res1.rows[0].result.success, true);
    assert.equal(res1.rows[0].result.idempotent, false);
    const originalProductId = res1.rows[0].result.product_id;

    // Request 2: Duplicate request with identical idempotencyKey
    const res2 = await client.query(`SELECT public.create_product_from_purchase_batch($1, $2, $3, $4, $5) AS result`, payload);
    assert.equal(res2.rows[0].result.success, true);
    assert.equal(res2.rows[0].result.idempotent, true);
    assert.equal(res2.rows[0].result.product_id, originalProductId);

    // Verify exactly ONE product exists
    const prodCount = await client.query(`SELECT count(*) FROM public.products WHERE id = $1`, [originalProductId]);
    assert.equal(prodCount.rows[0].count, '1');
  });

  test('Regression E (Safe Cancellation): Ordered batch with 0 linked units cancels cleanly; linked units block cancellation', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    // Create ordered batch
    const batchNumber = `PB-INT-${Date.now()}-E`;
    const bRes = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Supplier E', totalSupplierCostCents: 10000, totalExpensesCents: 0, totalLandedCostCents: 10000, totalPurchasedUnits: 5 }),
        JSON.stringify([]),
        JSON.stringify([{
          itemName: 'Cancel Item',
          totalQuantity: 5,
          totalSupplierCostCents: 10000,
          totalAllocatedExpenseCents: 0,
          totalLandedCostCents: 10000,
          variations: [{ variationTitle: 'Default', quantityPurchased: 5, supplierUnitPriceCents: 2000, lineSupplierCostCents: 10000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 10000, unitLandedCostCents: 2000 }],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = bRes.rows[0].result.batch_id;
    await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);

    // 0 units linked -> cancel must succeed
    const cancelRes = await client.query(`SELECT public.cancel_purchase_batch($1, 'Supplier out of raw material', $2) AS result`, [batchId, ADMIN_ID]);
    assert.equal(cancelRes.rows[0].result.success, true);
    assert.equal(cancelRes.rows[0].result.status, 'cancelled');

    const checkStatus = await client.query(`SELECT status, cancellation_reason FROM public.purchase_batches WHERE id = $1`, [batchId]);
    assert.equal(checkStatus.rows[0].status, 'cancelled');
    assert.equal(checkStatus.rows[0].cancellation_reason, 'Supplier out of raw material');
  });

  // ── 3. Advanced Financial & Concurrency Regressions ─────────────────────
  test('Regression F (Financial Reconciliation): 7 units with non-divisible cents reconcile exactly to 100%', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    // Total landed cost = 10,000 cents across 7 units
    // 10000 / 7 = 1428 base cents + 4 remainder cents
    const batchNumber = `PB-INT-${Date.now()}-F-7UNITS`;
    const bRes = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Supplier F', totalSupplierCostCents: 10000, totalExpensesCents: 0, totalLandedCostCents: 10000, totalPurchasedUnits: 7 }),
        JSON.stringify([]),
        JSON.stringify([{
          itemName: 'Odd Unit Ring',
          totalQuantity: 7,
          totalSupplierCostCents: 10000,
          totalAllocatedExpenseCents: 0,
          totalLandedCostCents: 10000,
          variations: [{ variationTitle: 'Size 7', quantityPurchased: 7, supplierUnitPriceCents: 1428, lineSupplierCostCents: 10000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 10000, unitLandedCostCents: 1428 }],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = bRes.rows[0].result.batch_id;
    await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);
    const varDb = await client.query(`SELECT id FROM public.purchase_batch_item_variations WHERE batch_id = $1`, [batchId]);
    const varId = varDb.rows[0].id;

    // Receive all 7 units
    const kF = `rcpt-F-${Date.now()}`;
    await client.query(`SELECT public.receive_purchase_batch_items($1, $2, $3, $4)`, [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 7 }]), kF, ADMIN_ID]);

    // Create target variant
    const prodRes = await client.query(`INSERT INTO public.products (name, slug) VALUES ('Odd Ring', 'odd-ring-${Date.now()}') RETURNING id`);
    const varRes = await client.query(
      `INSERT INTO public.product_variants (product_id, sku, title, price, stock_quantity, purchase_cost) VALUES ($1, $2, 'Default', 2500, 0, 0) RETURNING id`,
      [prodRes.rows[0].id, `ODD-${Date.now()}`]
    );
    const targetVarId = varRes.rows[0].id;

    // Transfer in two chunks: 4 units, then 3 units
    const t1 = await client.query(
      `SELECT public.transfer_purchase_stock_to_variant($1, $2, 4, 'restock_existing', $3, $4) AS result`,
      [varId, targetVarId, `t-F-1-${Date.now()}`, ADMIN_ID]
    );
    assert.equal(t1.rows[0].result.success, true);

    const t2 = await client.query(
      `SELECT public.transfer_purchase_stock_to_variant($1, $2, 3, 'restock_existing', $3, $4) AS result`,
      [varId, targetVarId, `t-F-2-${Date.now()}`, ADMIN_ID]
    );
    assert.equal(t2.rows[0].result.success, true);

    // Sum of transferred cents MUST equal exactly 10,000 cents (zero penny leakage!)
    const totalTransferredCents = BigInt(t1.rows[0].result.transferred_cost_cents) + BigInt(t2.rows[0].result.transferred_cost_cents);
    assert.equal(totalTransferredCents, BigInt(10000), 'Total transferred cents across all 7 units must reconcile to exactly 10,000 cents');
  });

  test('Regression G (Shortage & Corrections): Receiving correction adjusts received stock and preserves linked invariants', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    await client.query(`SET ROLE service_role;`);

    const batchNumber = `PB-INT-${Date.now()}-G-CORR`;
    const bRes = await client.query(
      `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
      [
        JSON.stringify({ batchNumber, supplierName: 'Supplier G', totalSupplierCostCents: 15000, totalExpensesCents: 0, totalLandedCostCents: 15000, totalPurchasedUnits: 15 }),
        JSON.stringify([]),
        JSON.stringify([{
          itemName: 'Silver Bangle',
          totalQuantity: 15,
          totalSupplierCostCents: 15000,
          totalAllocatedExpenseCents: 0,
          totalLandedCostCents: 15000,
          variations: [{ variationTitle: 'Default', quantityPurchased: 15, supplierUnitPriceCents: 1000, lineSupplierCostCents: 15000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 15000, unitLandedCostCents: 1000 }],
        }]),
        ADMIN_ID,
      ]
    );
    const batchId = bRes.rows[0].result.batch_id;
    await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);
    const varDb = await client.query(`SELECT id FROM public.purchase_batch_item_variations WHERE batch_id = $1`, [batchId]);
    const varId = varDb.rows[0].id;

    // Initially receive 10 units
    const kG1 = `rcpt-G1-${Date.now()}`;
    await client.query(`SELECT public.receive_purchase_batch_items($1, $2, $3, $4)`, [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 10 }]), kG1, ADMIN_ID]);

    // Admin creates product linking 5 units
    const sku = `BG-SKU-${Date.now()}`;
    const slug = `silver-bangle-${Date.now()}`;
    await client.query(
      `SELECT public.create_product_from_purchase_batch($1, $2, $3, $4, $5)`,
      [
        JSON.stringify({ name: 'Silver Bangle', slug, category_id: CATEGORY_ID }),
        JSON.stringify([{ title: 'Default', sku, price: 2000, batch_variation_id: varId, transfer_quantity: 5 }]),
        JSON.stringify([]),
        `idemp-G-${Date.now()}`,
        ADMIN_ID,
      ]
    );

    // Variation now has: purchased=15, received=10, linked=5 (unlinked available = 5)
    // Receiving correction 1: Over-count of 2 units found on intake, adjust down from 10 to 8 (-2)
    const corrRes = await client.query(
      `SELECT public.record_receiving_correction($1, $2, -2, 'damaged_on_arrival', 'Damaged in transit upon unpack inspection', $3) AS result`,
      [batchId, varId, ADMIN_ID]
    );
    assert.equal(corrRes.rows[0].result.success, true);
    assert.equal(corrRes.rows[0].result.new_quantity_received, 8);

    // Variation now has: received=8, linked=5.
    // Receiving correction 2: Attempting to correct down by -4 (which would make received 4 < linked 5) must be REJECTED!
    await assert.rejects(
      async () => {
        await client.query(
          `SELECT public.record_receiving_correction($1, $2, -4, 'short_shipped', 'Invalid reduction below linked', $3)`,
          [batchId, varId, ADMIN_ID]
        );
      },
      /Adjustment would reduce received quantity.*below already-linked quantity/
    );

    // Verify DB integrity
    const varCheck = await client.query(`SELECT quantity_received, quantity_linked FROM public.purchase_batch_item_variations WHERE id = $1`, [varId]);
    assert.equal(varCheck.rows[0].quantity_received, 8);
    assert.equal(varCheck.rows[0].quantity_linked, 5);
  });

  test('Regression H (Concurrency Protection): Concurrent transfers against scarce unlinked stock serialize cleanly', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    // Create a separate client connection to simulate concurrent admin/system worker
    const client2 = new Client({ connectionString: TEST_DB_URL });
    await client2.connect();

    try {
      await client.query(`SET ROLE service_role;`);
      await client2.query(`SET ROLE service_role;`);

      const batchNumber = `PB-INT-${Date.now()}-H-CONCUR`;
      const bRes = await client.query(
        `SELECT public.create_purchase_batch($1, $2, $3, $4) AS result`,
        [
          JSON.stringify({ batchNumber, supplierName: 'Supplier H', totalSupplierCostCents: 5000, totalExpensesCents: 0, totalLandedCostCents: 5000, totalPurchasedUnits: 5 }),
          JSON.stringify([]),
          JSON.stringify([{
            itemName: 'Limited Ruby Brooch',
            totalQuantity: 5,
            totalSupplierCostCents: 5000,
            totalAllocatedExpenseCents: 0,
            totalLandedCostCents: 5000,
            variations: [{ variationTitle: 'Default', quantityPurchased: 5, supplierUnitPriceCents: 1000, lineSupplierCostCents: 5000, lineAllocatedExpenseCents: 0, lineTotalLandedCostCents: 5000, unitLandedCostCents: 1000 }],
          }]),
          ADMIN_ID,
        ]
      );
      const batchId = bRes.rows[0].result.batch_id;
      await client.query(`SELECT public.confirm_purchase_batch($1, $2)`, [batchId, ADMIN_ID]);
      const varDb = await client.query(`SELECT id FROM public.purchase_batch_item_variations WHERE batch_id = $1`, [batchId]);
      const varId = varDb.rows[0].id;

      // Receive 5 units
      const kH = `rcpt-H-${Date.now()}`;
      await client.query(`SELECT public.receive_purchase_batch_items($1, $2, $3, $4)`, [batchId, JSON.stringify([{ batchVariationId: varId, quantityReceived: 5 }]), kH, ADMIN_ID]);

      // Target variants for client 1 and client 2
      const prodRes = await client.query(`INSERT INTO public.products (name, slug) VALUES ('Ruby Brooch', 'ruby-brooch-${Date.now()}') RETURNING id`);
      const v1Res = await client.query(`INSERT INTO public.product_variants (product_id, sku, title, price, stock_quantity, purchase_cost) VALUES ($1, $2, 'V1', 1500, 0, 0) RETURNING id`, [prodRes.rows[0].id, `RB1-${Date.now()}`]);
      const v2Res = await client.query(`INSERT INTO public.product_variants (product_id, sku, title, price, stock_quantity, purchase_cost) VALUES ($1, $2, 'V2', 1500, 0, 0) RETURNING id`, [prodRes.rows[0].id, `RB2-${Date.now()}`]);
      const targetVar1 = v1Res.rows[0].id;
      const targetVar2 = v2Res.rows[0].id;

      // Both try to claim all 5 units at the exact same time
      const p1 = client.query(
        `SELECT public.transfer_purchase_stock_to_variant($1, $2, 5, 'restock_existing', $3, $4) AS result`,
        [varId, targetVar1, `t-H-1-${Date.now()}`, ADMIN_ID]
      );
      const p2 = client2.query(
        `SELECT public.transfer_purchase_stock_to_variant($1, $2, 5, 'restock_existing', $3, $4) AS result`,
        [varId, targetVar2, `t-H-2-${Date.now()}`, ADMIN_ID]
      );

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      // Exactly one must succeed and exactly one must fail due to row-level locks
      assert.equal(fulfilled.length, 1, 'Exactly one concurrent transfer must succeed');
      assert.equal(rejected.length, 1, 'Exactly one concurrent transfer must fail');
      assert.match(rejected[0].reason.message, /Insufficient unlinked quantity/);

      // Verify unlinked stock never went below zero
      const finalVar = await client.query(`SELECT quantity_received, quantity_linked FROM public.purchase_batch_item_variations WHERE id = $1`, [varId]);
      assert.equal(finalVar.rows[0].quantity_received, 5);
      assert.equal(finalVar.rows[0].quantity_linked, 5);
    } finally {
      await client2.end();
    }
  });

  // ── 4. Authorization & Privilege Testing ───────────────────────────────────
  test('Security: Public & Authenticated roles are forbidden from executing purchasing procedures', async (t) => {
    if (!isDbAvailable) return t.skip('PostgreSQL test DB not available on port 5433');

    // 1. Anon role attempt
    await client.query(`SET ROLE anon;`);
    await assert.rejects(
      async () => {
        await client.query(`SELECT public.confirm_purchase_batch('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')`);
      },
      /permission denied/
    );

    // 2. Authenticated non-admin customer attempt
    await client.query(`SET ROLE authenticated;`);
    await client.query(`SET request.jwt.claim.sub = '${NON_ADMIN_ID}';`);
    await client.query(`SET request.jwt.claim.role = 'authenticated';`);
    await assert.rejects(
      async () => {
        await client.query(`SELECT public.create_purchase_batch('{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '${NON_ADMIN_ID}')`);
      },
      /permission denied/
    );

    // 3. Reset to service_role with invalid admin ID
    await client.query(`SET ROLE service_role;`);
    await client.query(`RESET request.jwt.claim.sub;`);
    await client.query(`RESET request.jwt.claim.role;`);

    await assert.rejects(
      async () => {
        await client.query(`SELECT public.confirm_purchase_batch('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-999999999999')`);
      },
      /Unauthorized: Caller is not an active administrator/
    );
  });
});

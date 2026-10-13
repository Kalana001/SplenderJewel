import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const pg = require('pg');
const { Pool } = pg;

// =============================================================================
// SPLENDER JEWEL — PHASE 6B FINAL DATABASE MIGRATION PREFLIGHT TEST SUITE
// =============================================================================

test('Phase 6B Preflight: Migration 00004 enforces full-payload idempotency, advisory locks, canonical variant locking, and safe coupon assignment', () => {
  const m4Path = join(process.cwd(), 'supabase', 'migrations', '00004_atomic_checkout_procedure.sql');
  assert.equal(existsSync(m4Path), true, 'Migration 00004 must exist');
  const sql = readFileSync(m4Path, 'utf8');

  // 1. Advisory transaction lock for concurrent duplicate idempotency_key serialization
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('splender_checkout_idem:' \|\| v_idempotency_key\)\)/);

  // 2. Full-payload verification on idempotent hit (identity, address, district, coupon, payment, and canonical items)
  assert.match(sql, /v_existing_items_canonical <> v_requested_items_canonical/);
  assert.match(sql, /v_existing_order\.district <> v_district/);
  assert.match(sql, /UPPER\(COALESCE\(v_existing_order\.coupon_code, ''\)\) <> COALESCE\(v_requested_coupon, ''\)/);
  assert.match(sql, /Idempotency key conflict: request parameters do not match existing order/);

  // 3. Registered customer profile & account_status check
  assert.match(sql, /FROM public\.profiles/);
  assert.match(sql, /Your customer account is suspended and cannot place orders/);

  // 4. Raw item quantity validation BEFORE idempotency check and SUM() aggregation
  assert.match(sql, /Item quantity must be a positive integer of at least 1/);

  // 5. Canonical UUID ordering on FOR UPDATE OF pv to prevent multi-item deadlocks
  assert.match(sql, /ORDER BY \(TRIM\(elem->>'variant_id'\)\)::UUID ASC/);
  assert.match(sql, /FOR UPDATE OF pv;/);

  // 6. Safe v_coupon_code scalar variable (preventing PL/pgSQL unassigned RECORD error 55000 when p_coupon_code is NULL)
  assert.match(sql, /v_coupon_code TEXT := NULL;/);
  assert.match(sql, /v_coupon_code := v_coupon\.code;/);
  assert.equal(sql.includes('CASE WHEN v_coupon_id IS NOT NULL THEN v_coupon.code'), false);

  // 7. Payment record created inside the same transaction for all orders
  assert.match(sql, /INSERT INTO public\.payments/);
});

test('Phase 6B Preflight: Migration 00005 resolves admin_users 42P17 recursion, grants complete review insert columns, and isolates privileges', () => {
  const m5Path = join(process.cwd(), 'supabase', 'migrations', '00005_database_security_hardening.sql');
  assert.equal(existsSync(m5Path), true, 'Migration 00005 must exist');
  const sql = readFileSync(m5Path, 'utf8');

  // 1. Defines SECURITY DEFINER is_super_admin() to eliminate 42P17 recursion on admin_users
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_super_admin\(\)/);
  assert.match(sql, /CREATE POLICY "Super admin manage admin_users" ON public\.admin_users[\s\S]*?USING \(public\.is_super_admin\(\)\)/);

  // 2. Grants sequence usage on order_number_seq to service_role and revokes from anon/authenticated
  assert.match(sql, /REVOKE ALL ON SEQUENCE public\.order_number_seq FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT USAGE, SELECT ON SEQUENCE public\.order_number_seq TO service_role/);

  // 3. Grants handle_new_user() to supabase_auth_admin so GoTrue signups succeed
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.handle_new_user\(\) TO supabase_auth_admin/);

  // 4. Allows service_role and postgres to update account_status in protect_profile_fields()
  assert.match(sql, /current_setting\('role', true\) NOT IN \('service_role', 'postgres'/);

  // 5. Public SELECT policies do not invoke public.is_admin() for anon
  assert.match(sql, /CREATE POLICY "Public view active products" ON public\.products\s+FOR SELECT USING \(is_active = TRUE\);/);

  // 6. Store settings public policy restricts to whitelisted non-sensitive keys
  assert.match(sql, /CREATE POLICY "Public view store settings" ON public\.store_settings/);

  // 7. Reviews GRANT INSERT includes customer_name, variant_id, title, created_at, updated_at
  assert.match(sql, /GRANT INSERT \([\s\S]*?customer_name[\s\S]*?title[\s\S]*?\) ON public\.reviews TO authenticated/);
});

test('Phase 6B Preflight: Real PostgreSQL 18 Migration, Full-Payload Idempotency, Concurrency, Rollback, Customer & Admin Permissions Suite', async (t) => {
  const PG_BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';
  const INITDB = join(PG_BIN, 'initdb.exe');
  const POSTGRES_EXE = join(PG_BIN, 'postgres.exe');
  const PG_CTL = join(PG_BIN, 'pg_ctl.exe');

  if (!existsSync(INITDB) || !existsSync(POSTGRES_EXE)) {
    t.skip('Local PostgreSQL 18 binaries not found; skipping live PostgreSQL integration test.');
    return;
  }

  const PG_DATA = join(tmpdir(), `splender_pg18_test_${process.pid}`);
  const PG_PORT = 55449;
  const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  if (existsSync(PG_DATA)) {
    try {
      execFileSync(PG_CTL, ['-D', PG_DATA, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
    } catch {}
    await sleep(200);
    rmSync(PG_DATA, { recursive: true, force: true });
  }

  execFileSync(INITDB, ['--nosync', '-D', PG_DATA, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale'], {
    stdio: 'ignore',
  });

  const pgProc = spawn(POSTGRES_EXE, ['-F', '-D', PG_DATA, '-p', String(PG_PORT), '-h', '127.0.0.1'], {
    stdio: 'ignore',
    windowsHide: true,
  });

  const pool = new Pool({
    host: '127.0.0.1',
    port: PG_PORT,
    user: 'postgres',
    database: 'postgres',
    max: 12,
  });

  try {
    for (let i = 0; i < 30; i++) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch {
        await sleep(200);
      }
    }

    // 1. Bootstrap Supabase-compatible auth and storage schemas
    await pool.query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE supabase_auth_admin NOLOGIN;
      GRANT anon, authenticated, service_role, supabase_auth_admin TO postgres;

      CREATE SCHEMA IF NOT EXISTS auth;
      GRANT USAGE ON SCHEMA auth TO PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
      CREATE TABLE auth.users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        email_confirmed_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      GRANT ALL ON TABLE auth.users TO postgres, service_role, supabase_auth_admin;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user);
      $$ LANGUAGE sql STABLE;

      CREATE SCHEMA IF NOT EXISTS storage;
      GRANT USAGE ON SCHEMA storage TO PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
      CREATE TABLE storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT FALSE,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[]
      );
      CREATE TABLE storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT REFERENCES storage.buckets(id),
        name TEXT,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
      CREATE OR REPLACE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] AS $$
        SELECT string_to_array(name, '/');
      $$ LANGUAGE sql IMMUTABLE;

      GRANT USAGE ON SCHEMA public TO PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
    `);

    // 2. Apply 00001 -> 00002 -> 00004 -> 00005 and re-apply 00004 + 00005 for idempotency
    for (const file of [
      '00001_initial_schema.sql',
      '00002_catalog_security_integrity.sql',
      '00004_atomic_checkout_procedure.sql',
      '00005_database_security_hardening.sql',
      '00004_atomic_checkout_procedure.sql',
      '00005_database_security_hardening.sql',
    ]) {
      await pool.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    }

    // 3. Signup & profile trigger tests (handle_new_user + protect_profile_fields)
    const adminUserId = 'a7db3a41-c12f-4dfd-9dc6-54fee355e60d';
    const customerUserId = 'b8ec4b52-d23e-4efe-8ed7-65fffa66f71e';

    const authClient = await pool.connect();
    try {
      await authClient.query('BEGIN');
      await authClient.query('SET LOCAL ROLE supabase_auth_admin');
      await authClient.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
          ($1, 'owner@splenderjewel.lk', '{"full_name":"Store Owner"}'::jsonb),
          ($2, 'customer@example.com', '{"full_name":"Nimali Perera"}'::jsonb)`,
        [adminUserId, customerUserId]
      );
      await authClient.query('COMMIT');
    } finally {
      authClient.release();
    }

    const profilesRes = await pool.query(`SELECT id, full_name, account_status FROM public.profiles ORDER BY email`);
    assert.equal(profilesRes.rowCount, 2, 'handle_new_user must create profiles for signed-up users');

    // Verify customer cannot escalate account_status, but can update safe profile fields
    const custProfileClient = await pool.connect();
    try {
      await custProfileClient.query('BEGIN');
      await custProfileClient.query('SET LOCAL ROLE authenticated');
      await custProfileClient.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [customerUserId]);
      await custProfileClient.query(
        `UPDATE public.profiles SET full_name = 'Nimali S. Perera', phone1 = '0771234567' WHERE id = $1`,
        [customerUserId]
      );
      await custProfileClient.query('SAVEPOINT sp_profile_esc');
      await assert.rejects(
        () => custProfileClient.query(`UPDATE public.profiles SET account_status = 'suspended' WHERE id = $1`, [customerUserId]),
        /permission denied|Unauthorized/i
      );
      await custProfileClient.query('ROLLBACK TO SAVEPOINT sp_profile_esc');
      await custProfileClient.query('COMMIT');
    } finally {
      custProfileClient.release();
    }

    // 4. Admin & CMS permission tests
    await pool.query(
      `INSERT INTO public.admin_users (id, full_name, email, role, is_active)
       SELECT u.id, 'Splender Jewel Super Admin', u.email, 'super_admin', TRUE
       FROM auth.users u WHERE u.id = $1`,
      [adminUserId]
    );

    const rlsClient = await pool.connect();
    try {
      await rlsClient.query('BEGIN');
      await rlsClient.query('SET LOCAL ROLE authenticated');
      await rlsClient.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [adminUserId]);
      const adminRes = await rlsClient.query(`SELECT id, role FROM public.admin_users`);
      assert.equal(adminRes.rowCount, 1);
      assert.equal(adminRes.rows[0].role, 'super_admin');
      await rlsClient.query('COMMIT');
    } finally {
      rlsClient.release();
    }

    // Seed catalog, images, coupons, and test admin stock adjustment via service_role
    const catId = '11111111-1111-4111-8111-111111111111';
    const prodId = '22222222-2222-4222-8222-222222222222';
    const var1Id = '33333333-3333-4333-8333-333333333331';
    const var2Id = '33333333-3333-4333-8333-333333333332';
    const varRaceId = '44444444-4444-4444-8444-444444444445';
    const couponId = '55555555-5555-4555-8555-555555555555';

    await pool.query(`
      INSERT INTO public.categories (id, name, slug, is_active) VALUES ('${catId}', 'Rings', 'rings', TRUE);
      INSERT INTO public.products (id, name, slug, category_id, is_active) VALUES ('${prodId}', 'Royal Sapphire Ring', 'royal-sapphire-ring', '${catId}', TRUE);
      INSERT INTO public.product_images (product_id, url, is_primary, display_order)
      VALUES ('${prodId}', 'https://example.com/sapphire-ring.jpg', TRUE, 0);
      INSERT INTO public.product_variants (id, product_id, sku, title, price, discount_price, purchase_cost, stock_quantity, low_stock_threshold, stock_status, is_active)
      VALUES
        ('${var1Id}', '${prodId}', 'SJ-SAP-1', 'Size 6', 50000, 45000, 30000, 10, 2, 'in_stock', TRUE),
        ('${var2Id}', '${prodId}', 'SJ-SAP-2', 'Size 7', 60000, NULL, 35000, 5, 2, 'in_stock', TRUE),
        ('${varRaceId}', '${prodId}', 'SJ-RACE-1', 'Size 8', 50000, 45000, 30000, 1, 2, 'low_stock', TRUE);
      INSERT INTO public.coupons (id, code, discount_type, discount_value, min_order_amount, max_discount_amount, total_usage_limit, per_customer_limit, is_active)
      VALUES ('${couponId}', 'ROYAL10', 'percentage', 10, 10000, 15000, 5, 2, TRUE);
    `);

    // Verify service_role can execute adjust_variant_stock
    const srvClient = await pool.connect();
    try {
      await srvClient.query('BEGIN');
      await srvClient.query('SET LOCAL ROLE service_role');
      const adjRes = await srvClient.query(
        `SELECT * FROM public.adjust_variant_stock($1::uuid, 2, 'stock_added', 'RESTOCK_BATCH_1', $2::uuid)`,
        [var1Id, adminUserId]
      );
      assert.equal(adjRes.rows[0].new_quantity, 12);
      await srvClient.query('COMMIT');
    } finally {
      srvClient.release();
    }

    // 5. Anonymous storefront read tests
    const anonClient = await pool.connect();
    try {
      await anonClient.query('BEGIN');
      await anonClient.query('SET LOCAL ROLE anon');
      const pubProd = await anonClient.query(`SELECT id, name FROM public.products WHERE is_active = TRUE`);
      assert.equal(pubProd.rowCount, 1);
      const pubImg = await anonClient.query(`SELECT url, is_primary FROM public.product_images WHERE product_id = $1`, [prodId]);
      assert.equal(pubImg.rowCount, 1);
      assert.equal(pubImg.rows[0].url, 'https://example.com/sapphire-ring.jpg');
      const pubVar = await anonClient.query(`SELECT id, sku, price, stock_status FROM public.public_product_variants WHERE product_id = $1`, [prodId]);
      assert.equal(pubVar.rowCount, 3);

      // Verify anon is denied purchase_cost and orders
      await anonClient.query('SAVEPOINT sp_anon_1');
      await assert.rejects(
        () => anonClient.query(`SELECT purchase_cost FROM public.product_variants`),
        /permission denied/i
      );
      await anonClient.query('ROLLBACK TO SAVEPOINT sp_anon_1');
      await anonClient.query('SAVEPOINT sp_anon_2');
      await assert.rejects(
        () => anonClient.query(`SELECT id FROM public.orders`),
        /permission denied/i
      );
      await anonClient.query('ROLLBACK TO SAVEPOINT sp_anon_2');
      await anonClient.query('COMMIT');
    } finally {
      anonClient.release();
    }

    // 6. Task A: Idempotency retry & complete-payload conflict tests
    const idemKey = 'chk-idem-complete-payload-0001';
    const baseOrderData = {
      user_id: customerUserId,
      customer_name: 'Nimali S. Perera',
      email: 'customer@example.com',
      phone1: '0771234567',
      phone2: '0112345678',
      address_line: '42 Flower Road',
      city: 'Colombo 07',
      district: 'Colombo',
      postal_code: '00700',
      delivery_notes: 'Call at gate',
      payment_method: 'cod',
      idempotency_key: idemKey,
    };
    const baseItemsData = [
      { variant_id: var1Id, quantity: 2 },
      { variant_id: var2Id, quantity: 1 },
    ];

    // 6A. Initial order creation
    const firstOrderRes = await pool.query(
      `SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10') AS result`,
      [JSON.stringify(baseOrderData), JSON.stringify(baseItemsData)]
    );
    const firstOrder = firstOrderRes.rows[0].result;
    assert.equal(firstOrder.success, true);
    assert.equal(firstOrder.idempotent, false);

    // 6B. Retry with identical payload (even with reversed item order in JSON array) -> returns original order
    const retryIdenticalRes = await pool.query(
      `SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'royal10') AS result`,
      [
        JSON.stringify(baseOrderData),
        JSON.stringify([
          { variant_id: var2Id, quantity: 1 },
          { variant_id: var1Id, quantity: 2 },
        ]),
      ]
    );
    const retryIdentical = retryIdenticalRes.rows[0].result;
    assert.equal(retryIdentical.success, true);
    assert.equal(retryIdentical.idempotent, true);
    assert.equal(retryIdentical.is_duplicate, true);
    assert.equal(retryIdentical.order_id, firstOrder.order_id);
    assert.equal(retryIdentical.order_number, firstOrder.order_number);

    // Verify stock was only deducted once (var1: 12 -> 10, var2: 5 -> 4)
    const stockAfterRetry = await pool.query(
      `SELECT id, stock_quantity FROM public.product_variants WHERE id IN ($1, $2) ORDER BY sku`,
      [var1Id, var2Id]
    );
    assert.equal(stockAfterRetry.rows[0].stock_quantity, 10);
    assert.equal(stockAfterRetry.rows[1].stock_quantity, 4);

    // 6C. Retry with different item quantity -> controlled conflict
    await assert.rejects(
      () =>
        pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10')`, [
          JSON.stringify(baseOrderData),
          JSON.stringify([
            { variant_id: var1Id, quantity: 3 },
            { variant_id: var2Id, quantity: 1 },
          ]),
        ]),
      /Idempotency key conflict: request parameters do not match existing order/
    );

    // 6D. Retry with different variant list -> controlled conflict
    await assert.rejects(
      () =>
        pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10')`, [
          JSON.stringify(baseOrderData),
          JSON.stringify([{ variant_id: var1Id, quantity: 2 }]),
        ]),
      /Idempotency key conflict: request parameters do not match existing order/
    );

    // 6E. Retry with different delivery district -> controlled conflict
    await assert.rejects(
      () =>
        pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10')`, [
          JSON.stringify({ ...baseOrderData, district: 'Gampaha' }),
          JSON.stringify(baseItemsData),
        ]),
      /Idempotency key conflict: request parameters do not match existing order/
    );

    // 6F. Retry with different coupon -> controlled conflict
    await assert.rejects(
      () =>
        pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, NULL)`, [
          JSON.stringify(baseOrderData),
          JSON.stringify(baseItemsData),
        ]),
      /Idempotency key conflict: request parameters do not match existing order/
    );

    // 6G. Retry with different payment method -> controlled conflict
    await assert.rejects(
      () =>
        pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10')`, [
          JSON.stringify({ ...baseOrderData, payment_method: 'bank_transfer' }),
          JSON.stringify(baseItemsData),
        ]),
      /Idempotency key conflict: request parameters do not match existing order/
    );

    // 6H. Retry with different delivery address -> controlled conflict
    await assert.rejects(
      () =>
        pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10')`, [
          JSON.stringify({ ...baseOrderData, address_line: '99 Different Street' }),
          JSON.stringify(baseItemsData),
        ]),
      /Idempotency key conflict: request parameters do not match existing order/
    );

    // 6I. Retry with different customer identity (cross-customer disclosure prevention) -> controlled conflict
    await assert.rejects(
      () =>
        pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10')`, [
          JSON.stringify({ ...baseOrderData, user_id: null, customer_name: 'Other Person', phone1: '0719999999' }),
          JSON.stringify(baseItemsData),
        ]),
      /Idempotency key conflict: request parameters do not match existing order/
    );

    // 7. Concurrent stock purchase race test (4 buyers competing for 1 unit)
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, (_, idx) =>
        pool
          .query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, NULL) AS result`, [
            JSON.stringify({
              customer_name: `Buyer ${idx + 1}`,
              phone1: `077100000${idx + 1}`,
              address_line: '10 Galle Road',
              district: 'Colombo',
              payment_method: 'cod',
              idempotency_key: `idem-test-race-key-000${idx + 1}`,
            }),
            JSON.stringify([{ variant_id: varRaceId, quantity: 1 }]),
          ])
          .then((res: any) => ({ status: 'fulfilled', value: res.rows[0].result }))
          .catch((err: any) => ({ status: 'rejected', reason: err.message }))
      )
    );

    const successes = outcomes.filter((o) => o.status === 'fulfilled');
    const failures = outcomes.filter((o) => o.status === 'rejected' && o.reason.includes('Insufficient stock'));
    assert.equal(successes.length, 1, 'Exactly 1 concurrent checkout must succeed');
    assert.equal(failures.length, 3, 'Remaining 3 concurrent checkouts must fail with Insufficient stock');

    const finalStock = await pool.query(`SELECT stock_quantity, stock_status FROM public.product_variants WHERE id = $1`, [varRaceId]);
    assert.equal(finalStock.rows[0].stock_quantity, 0);
    assert.equal(finalStock.rows[0].stock_status, 'out_of_stock');

    // 8. Rollback test: multi-item order where second item has 0 stock must leave first item untouched
    await assert.rejects(
      () =>
        pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, NULL)`, [
          JSON.stringify({
            customer_name: 'Rollback Tester',
            phone1: '0775555555',
            address_line: '12 Lake Road',
            district: 'Colombo',
            payment_method: 'cod',
            idempotency_key: 'idem-rollback-test-0001',
          }),
          JSON.stringify([
            { variant_id: var1Id, quantity: 2 },
            { variant_id: varRaceId, quantity: 1 }, // out of stock!
          ]),
        ]),
      /Insufficient stock/
    );
    const var1AfterRollback = await pool.query(`SELECT stock_quantity FROM public.product_variants WHERE id = $1`, [var1Id]);
    assert.equal(var1AfterRollback.rows[0].stock_quantity, 10, 'var1 stock must remain 10 after multi-item rollback');

    // 9. Customer Account, Wishlist, Address, Order Read & Review Submission Tests (Task B)
    // Mark firstOrder as delivered so customer can submit a verified purchase review
    await pool.query(`UPDATE public.orders SET order_status = 'delivered' WHERE id = $1`, [firstOrder.order_id]);
    const orderItemsRes = await pool.query(
      `SELECT id FROM public.order_items WHERE order_id = $1 AND variant_id = $2`,
      [firstOrder.order_id, var1Id]
    );
    const deliveredOrderItemId = orderItemsRes.rows[0].id;

    const custClient = await pool.connect();
    try {
      await custClient.query('BEGIN');
      await custClient.query('SET LOCAL ROLE authenticated');
      await custClient.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [customerUserId]);

      // 9A. Customer reads own order with address_line, city, district, province, postal_code
      const custOrderRes = await custClient.query(
        `SELECT id, order_number, address_line, city, district, province, postal_code, total_amount
         FROM public.orders WHERE id = $1 AND user_id = $2`,
        [firstOrder.order_id, customerUserId]
      );
      assert.equal(custOrderRes.rowCount, 1);
      assert.equal(custOrderRes.rows[0].address_line, '42 Flower Road');
      assert.equal(custOrderRes.rows[0].city, 'Colombo 07');

      // 9B. Customer creates wishlist + wishlist_item and queries with product_images.url
      const wlRes = await custClient.query(
        `INSERT INTO public.wishlists (user_id) VALUES ($1) RETURNING id`,
        [customerUserId]
      );
      const wishlistId = wlRes.rows[0].id;
      await custClient.query(
        `INSERT INTO public.wishlist_items (wishlist_id, product_id, variant_id) VALUES ($1, $2, $3)`,
        [wishlistId, prodId, var1Id]
      );
      const wlItemsQuery = await custClient.query(
        `SELECT wi.id, p.name, pi.url, pi.is_primary
         FROM public.wishlist_items wi
         JOIN public.products p ON p.id = wi.product_id
         LEFT JOIN public.product_images pi ON pi.product_id = p.id
         WHERE wi.wishlist_id = $1`,
        [wishlistId]
      );
      assert.equal(wlItemsQuery.rowCount, 1);
      assert.equal(wlItemsQuery.rows[0].url, 'https://example.com/sapphire-ring.jpg');

      // 9C. Customer submits verified review with all columns used by submitCustomerReview
      const revInsert = await custClient.query(
        `INSERT INTO public.reviews (
           product_id, variant_id, order_id, order_item_id, user_id,
           customer_name, rating, title, comment, is_verified_purchase, is_approved,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'Nimali S. Perera', 5, 'Exquisite craftsmanship', 'Absolutely stunning ring!', TRUE, FALSE, NOW(), NOW())
         RETURNING id`,
        [prodId, var1Id, firstOrder.order_id, deliveredOrderItemId, customerUserId]
      );
      assert.equal(revInsert.rowCount, 1, 'Authenticated customer must be able to insert verified purchase review');

      await custClient.query('COMMIT');
    } finally {
      custClient.release();
    }
  } finally {
    await pool.end().catch(() => {});
    try {
      execFileSync(PG_CTL, ['-D', PG_DATA, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
    } catch {}
    if (pgProc.pid) {
      try {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(pgProc.pid)], { stdio: 'ignore' });
      } catch {}
    }
    try {
      pgProc.kill();
    } catch {}
    await sleep(200);
    try {
      rmSync(PG_DATA, { recursive: true, force: true });
    } catch {}
  }
});

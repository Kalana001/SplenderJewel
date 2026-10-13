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

test('Phase 6B Preflight: Migration 00004 enforces full-payload idempotency, least-privilege column grants, and service_role-only execution', () => {
  const m4Path = join(process.cwd(), 'supabase', 'migrations', '00004_atomic_checkout_procedure.sql');
  assert.equal(existsSync(m4Path), true, 'Migration 00004 must exist');
  const sql = readFileSync(m4Path, 'utf8');

  // 1. Mandatory 16-128 char idempotency key + advisory transaction lock for concurrent duplicate serialization
  assert.match(sql, /IF v_idempotency_key IS NULL OR char_length\(v_idempotency_key\) < 16 OR char_length\(v_idempotency_key\) > 128 THEN/);
  assert.match(sql, /RAISE EXCEPTION 'Idempotency key is required and must be between 16 and 128 characters\.'/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('splender_checkout_idem:' \|\| v_idempotency_key\)\)/);

  // 2. Full-payload verification on idempotent hit (identity, address, district, coupon, payment, and canonical items)
  assert.match(sql, /v_existing_items_canonical <> v_requested_items_canonical/);
  assert.match(sql, /v_existing_order\.district <> v_district/);
  assert.match(sql, /UPPER\(COALESCE\(v_existing_order\.coupon_code, ''\)\) <> COALESCE\(v_requested_coupon, ''\)/);
  assert.match(sql, /Idempotency key conflict: request parameters do not match existing order/);

  // 3. Explicit column-level AND table-level REVOKE on public.orders and public.order_items (never relying on column REVOKE alone)
  assert.match(sql, /REVOKE ALL \([\s\S]*?order_token[\s\S]*?admin_notes[\s\S]*?idempotency_key[\s\S]*?\) ON public\.orders FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.orders FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT SELECT \([\s\S]*?order_number[\s\S]*?tracking_number[\s\S]*?\) ON public\.orders TO authenticated;/);
  assert.match(sql, /REVOKE ALL \([\s\S]*?purchase_cost[\s\S]*?\) ON public\.order_items FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.order_items FROM PUBLIC, anon, authenticated;/);

  // 4. Defense-in-depth runtime role check inside process_order_checkout + ACL restriction to service_role
  assert.match(sql, /RAISE EXCEPTION 'permission denied for function process_order_checkout'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.process_order_checkout\(JSONB, JSONB, TEXT\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.process_order_checkout\(JSONB, JSONB, TEXT\) TO service_role;/);

  // 5. Registered customer profile & account_status check
  assert.match(sql, /FROM public\.profiles/);
  assert.match(sql, /Your customer account is suspended and cannot place orders/);

  // 6. Raw item quantity validation BEFORE idempotency check and SUM() aggregation
  assert.match(sql, /Item quantity must be a positive integer of at least 1/);

  // 7. Canonical UUID ordering on FOR UPDATE OF pv to prevent multi-item deadlocks
  assert.match(sql, /ORDER BY \(TRIM\(elem->>'variant_id'\)\)::UUID ASC/);
  assert.match(sql, /FOR UPDATE OF pv;/);

  // 8. Safe v_coupon_code scalar variable (preventing PL/pgSQL unassigned RECORD error 55000 when p_coupon_code is NULL)
  assert.match(sql, /v_coupon_code TEXT := NULL;/);
  assert.match(sql, /v_coupon_code := v_coupon\.code;/);
  assert.equal(sql.includes('CASE WHEN v_coupon_id IS NOT NULL THEN v_coupon.code'), false);

  // 9. Payment record created inside the same transaction for all orders
  assert.match(sql, /INSERT INTO public\.payments/);

  // 10. Cancellation inventory integrity: missing variants raise exception and roll back entire cancellation
  assert.match(sql, /Cannot restock order %: product variant % not found/);
  assert.match(sql, /Cannot restock order %: line item is missing a product variant reference/);
});

test('Phase 6B Preflight: Migration 00005 and checkout server actions preserve least-privilege isolation and verify customer identity server-side', () => {
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

  // 5. Reinforces process_order_checkout service_role-only execution and explicit column+table REVOKE on orders
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.process_order_checkout\(JSONB, JSONB, TEXT\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL \([\s\S]*?idempotency_key[\s\S]*?\) ON public\.orders FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.orders FROM PUBLIC, anon, authenticated;/);

  // 6. Reviews GRANT INSERT includes customer_name, variant_id, title, created_at, updated_at
  assert.match(sql, /GRANT INSERT \([\s\S]*?customer_name[\s\S]*?title[\s\S]*?\) ON public\.reviews TO authenticated/);

  // 7. Checkout server action derives identity strictly from getCurrentUser(), rejects client-supplied user_id, and requires 16-128 char idempotency key
  const actionsPath = join(process.cwd(), 'lib', 'orders', 'actions.ts');
  const actionsCode = readFileSync(actionsPath, 'utf8');
  assert.match(actionsCode, /Client-supplied user identity is not permitted/);
  assert.match(actionsCode, /const currentUser = await getCurrentUser\(\)/);
  assert.match(actionsCode, /const userId = currentUser \? currentUser\.id : null/);
  assert.match(actionsCode, /if \(!trimmedRequestId \|\| trimmedRequestId\.length < 16 \|\| trimmedRequestId\.length > 128\)/);
  assert.match(actionsCode, /Idempotency key is required and must be between 16 and 128 characters\./);

  // 8. Frontend checkout page preserves stable key across retries of identical payload and generates fresh key on new order / payload change
  const checkoutPagePath = join(process.cwd(), 'app', '(store)', 'checkout', 'page.tsx');
  const checkoutPageCode = readFileSync(checkoutPagePath, 'utf8');
  assert.match(checkoutPageCode, /if \(!clientRequestIdRef\.current \|\| clientRequestPayloadRef\.current !== payloadFingerprint\)/);
  assert.match(checkoutPageCode, /if \(res\.error\?\.startsWith\('Idempotency key conflict'\)\)/);
});

test('Phase 6B Preflight: Real PostgreSQL 18 Migration, 00004 Standalone Privilege Isolation, Full-Payload Idempotency, Concurrency, Rollback, Customer & Admin Permissions Suite', async (t) => {
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

    // 2A. Apply historical migrations 00001 and 00002, then simulate confirmed live Supabase pre-00004 state
    // where anon and authenticated hold table-level SELECT, INSERT, UPDATE, DELETE on public.orders & public.order_items
    await pool.query(readFileSync(join(MIGRATIONS_DIR, '00001_initial_schema.sql'), 'utf8'));
    await pool.query(readFileSync(join(MIGRATIONS_DIR, '00002_catalog_security_integrity.sql'), 'utf8'));
    await pool.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders, public.order_items TO anon, authenticated;
      GRANT SELECT (order_token, admin_notes) ON public.orders TO anon, authenticated;
    `);

    const preM4Privs = await pool.query(`
      SELECT
        has_column_privilege('anon', 'public.orders', 'order_token', 'SELECT') AS anon_token_pre,
        has_column_privilege('authenticated', 'public.orders', 'order_token', 'SELECT') AS auth_token_pre,
        has_table_privilege('anon', 'public.orders', 'INSERT') AS anon_insert_pre
    `);
    assert.equal(preM4Privs.rows[0].anon_token_pre, true);
    assert.equal(preM4Privs.rows[0].auth_token_pre, true);
    assert.equal(preM4Privs.rows[0].anon_insert_pre, true);

    // 2B. Apply ONLY 00004_atomic_checkout_procedure.sql first (before 00005) and verify standalone privilege isolation
    await pool.query(readFileSync(join(MIGRATIONS_DIR, '00004_atomic_checkout_procedure.sql'), 'utf8'));

    const postM4StandalonePrivs = await pool.query(`
      SELECT
        has_column_privilege('anon', 'public.orders', 'idempotency_key', 'SELECT') AS anon_idem,
        has_column_privilege('anon', 'public.orders', 'order_token', 'SELECT') AS anon_token,
        has_column_privilege('anon', 'public.orders', 'admin_notes', 'SELECT') AS anon_notes,
        has_column_privilege('anon', 'public.orders', 'id', 'SELECT') AS anon_id,
        has_table_privilege('anon', 'public.orders', 'INSERT') AS anon_insert,
        has_table_privilege('anon', 'public.orders', 'UPDATE') AS anon_update,
        has_table_privilege('anon', 'public.orders', 'DELETE') AS anon_delete,
        has_column_privilege('authenticated', 'public.orders', 'idempotency_key', 'SELECT') AS auth_idem,
        has_column_privilege('authenticated', 'public.orders', 'order_token', 'SELECT') AS auth_token,
        has_column_privilege('authenticated', 'public.orders', 'admin_notes', 'SELECT') AS auth_notes,
        has_column_privilege('authenticated', 'public.orders', 'id', 'SELECT') AS auth_id,
        has_column_privilege('authenticated', 'public.orders', 'order_number', 'SELECT') AS auth_order_num,
        has_column_privilege('authenticated', 'public.orders', 'total_amount', 'SELECT') AS auth_total,
        has_table_privilege('authenticated', 'public.orders', 'INSERT') AS auth_insert,
        has_table_privilege('authenticated', 'public.orders', 'UPDATE') AS auth_update,
        has_table_privilege('authenticated', 'public.orders', 'DELETE') AS auth_delete,
        has_column_privilege('authenticated', 'public.order_items', 'purchase_cost', 'SELECT') AS auth_item_cost,
        has_column_privilege('authenticated', 'public.order_items', 'unit_price', 'SELECT') AS auth_item_price,
        has_function_privilege('anon', 'public.process_order_checkout(jsonb,jsonb,text)', 'EXECUTE') AS anon_exec_checkout,
        has_function_privilege('authenticated', 'public.process_order_checkout(jsonb,jsonb,text)', 'EXECUTE') AS auth_exec_checkout,
        has_function_privilege('service_role', 'public.process_order_checkout(jsonb,jsonb,text)', 'EXECUTE') AS srv_exec_checkout
    `);
    const p4 = postM4StandalonePrivs.rows[0];
    assert.equal(p4.anon_idem, false, '00004 standalone: anon must NOT have SELECT on orders.idempotency_key');
    assert.equal(p4.anon_token, false, '00004 standalone: anon must NOT have SELECT on orders.order_token');
    assert.equal(p4.anon_notes, false, '00004 standalone: anon must NOT have SELECT on orders.admin_notes');
    assert.equal(p4.anon_id, false, '00004 standalone: anon must NOT have SELECT on orders.id');
    assert.equal(p4.anon_insert, false, '00004 standalone: anon must NOT have INSERT on orders');
    assert.equal(p4.anon_update, false, '00004 standalone: anon must NOT have UPDATE on orders');
    assert.equal(p4.anon_delete, false, '00004 standalone: anon must NOT have DELETE on orders');
    assert.equal(p4.auth_idem, false, '00004 standalone: authenticated must NOT have SELECT on orders.idempotency_key');
    assert.equal(p4.auth_token, false, '00004 standalone: authenticated must NOT have SELECT on orders.order_token');
    assert.equal(p4.auth_notes, false, '00004 standalone: authenticated must NOT have SELECT on orders.admin_notes');
    assert.equal(p4.auth_id, true, '00004 standalone: authenticated MUST have SELECT on orders.id');
    assert.equal(p4.auth_order_num, true, '00004 standalone: authenticated MUST have SELECT on orders.order_number');
    assert.equal(p4.auth_total, true, '00004 standalone: authenticated MUST have SELECT on orders.total_amount');
    assert.equal(p4.auth_insert, false, '00004 standalone: authenticated must NOT have INSERT on orders');
    assert.equal(p4.auth_update, false, '00004 standalone: authenticated must NOT have UPDATE on orders');
    assert.equal(p4.auth_delete, false, '00004 standalone: authenticated must NOT have DELETE on orders');
    assert.equal(p4.auth_item_cost, false, '00004 standalone: authenticated must NOT have SELECT on order_items.purchase_cost');
    assert.equal(p4.auth_item_price, true, '00004 standalone: authenticated MUST have SELECT on order_items.unit_price');
    assert.equal(p4.anon_exec_checkout, false, '00004 standalone: anon must NOT execute process_order_checkout');
    assert.equal(p4.auth_exec_checkout, false, '00004 standalone: authenticated must NOT execute process_order_checkout');
    assert.equal(p4.srv_exec_checkout, true, '00004 standalone: service_role MUST execute process_order_checkout');

    // 2C. Apply 00005 and re-apply 00004 + 00005 to verify idempotency and non-conflict
    for (const file of [
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

    // 6. Task A: Idempotency validation, retry & complete-payload conflict tests
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

    // 6.0. Missing, blank, too-short (<16) and too-long (>128) idempotency keys are strictly rejected
    for (const badIdem of [null, '', '   ', 'chk-short-15chr', 'a'.repeat(129)]) {
      await assert.rejects(
        () =>
          pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10')`, [
            JSON.stringify({ ...baseOrderData, idempotency_key: badIdem }),
            JSON.stringify(baseItemsData),
          ]),
        /Idempotency key is required and must be between 16 and 128 characters/
      );
    }

    // 6A. Initial order creation
    const firstOrderRes = await pool.query(
      `SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10') AS result`,
      [JSON.stringify(baseOrderData), JSON.stringify(baseItemsData)]
    );
    const firstOrder = firstOrderRes.rows[0].result;
    assert.equal(firstOrder.success, true);
    assert.equal(firstOrder.idempotent, false);

    // 6A.1 Concurrent duplicate requests with the same key and payload serialize safely
    const dupOutcomes = await Promise.all([
      pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10') AS result`, [
        JSON.stringify(baseOrderData),
        JSON.stringify(baseItemsData),
      ]),
      pool.query(`SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10') AS result`, [
        JSON.stringify(baseOrderData),
        JSON.stringify(baseItemsData),
      ]),
    ]);
    const dupRes1 = dupOutcomes[0].rows[0].result;
    const dupRes2 = dupOutcomes[1].rows[0].result;
    assert.equal(dupRes1.success, true);
    assert.equal(dupRes2.success, true);
    assert.equal(dupRes1.order_id, firstOrder.order_id);
    assert.equal(dupRes2.order_id, firstOrder.order_id);
    assert.equal(dupRes1.idempotent, true);
    assert.equal(dupRes2.idempotent, true);

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

    // 9. Customer Order-History, Guest Confirmation, Payment Records, Coupon Limit & Negative Security Tests
    // Verify payment record was created for firstOrder
    const paymentRes = await pool.query(
      `SELECT payment_method, amount, status FROM public.payments WHERE order_id = $1`,
      [firstOrder.order_id]
    );
    assert.equal(paymentRes.rowCount, 1);
    assert.equal(paymentRes.rows[0].payment_method, 'cod');
    assert.equal(Number(paymentRes.rows[0].amount), Number(firstOrder.total_amount));
    assert.equal(paymentRes.rows[0].status, 'pending');

    // Create a guest bank_transfer order (also testing coupon per_customer_limit = 2)
    const guestOrderRes = await pool.query(
      `SELECT public.process_order_checkout($1::jsonb, $2::jsonb, 'ROYAL10') AS result`,
      [
        JSON.stringify({
          user_id: null,
          customer_name: 'Kasun Jayasuriya',
          email: 'kasun@example.com',
          phone1: '0718887776',
          address_line: '88 Peradeniya Road',
          city: 'Kandy',
          district: 'Kandy',
          postal_code: '20000',
          payment_method: 'bank_transfer',
          idempotency_key: 'guest-bank-transfer-idem-0001',
        }),
        JSON.stringify([{ variant_id: var1Id, quantity: 1 }]),
      ]
    );
    const guestOrder = guestOrderRes.rows[0].result;
    assert.equal(guestOrder.success, true);

    // Verify guest order confirmation server query pattern (matching BOTH order_number AND order_token via service_role)
    const guestConfirmValid = await pool.query(
      `SELECT id, order_number, customer_name, total_amount, payment_method
       FROM public.orders
       WHERE order_number = $1 AND order_token = $2::uuid`,
      [guestOrder.order_number, guestOrder.order_token]
    );
    assert.equal(guestConfirmValid.rowCount, 1);
    assert.equal(guestConfirmValid.rows[0].customer_name, 'Kasun Jayasuriya');
    assert.equal(guestConfirmValid.rows[0].payment_method, 'bank_transfer');

    const guestConfirmWrongToken = await pool.query(
      `SELECT id FROM public.orders WHERE order_number = $1 AND order_token = '00000000-0000-4000-8000-000000000000'::uuid`,
      [guestOrder.order_number]
    );
    assert.equal(guestConfirmWrongToken.rowCount, 0, 'Wrong order_token must return 0 rows');

    // Mark firstOrder as delivered so customer can submit a verified purchase review
    await pool.query(`UPDATE public.orders SET order_status = 'delivered' WHERE id = $1`, [firstOrder.order_id]);
    const orderItemsRes = await pool.query(
      `SELECT id FROM public.order_items WHERE order_id = $1 AND variant_id = $2`,
      [firstOrder.order_id, var1Id]
    );
    const deliveredOrderItemId = orderItemsRes.rows[0].id;

    // 9A. Negative Security Tests for anon on public.orders, public.order_items, and process_order_checkout
    const anonNegClient = await pool.connect();
    try {
      await anonNegClient.query('BEGIN');
      await anonNegClient.query('SET LOCAL ROLE anon');
      for (const badSql of [
        `SELECT idempotency_key FROM public.orders`,
        `SELECT order_token FROM public.orders`,
        `SELECT admin_notes FROM public.orders`,
        `SELECT id, order_number FROM public.orders`,
        `SELECT * FROM public.orders`,
        `SELECT purchase_cost FROM public.order_items`,
        `SELECT id FROM public.order_items`,
        `SELECT stock_quantity FROM public.product_variants`,
        `SELECT purchase_cost FROM public.product_variants`,
        `SELECT low_stock_threshold FROM public.product_variants`,
        `SELECT * FROM public.product_variants`,
        `INSERT INTO public.orders (customer_name, phone1, address_line, district, subtotal, total_amount, payment_method) VALUES ('Evil', '0770000000', 'X', 'Colombo', 0, 0, 'cod')`,
        `SELECT public.process_order_checkout('{}'::jsonb, '[]'::jsonb, NULL)`,
      ]) {
        await anonNegClient.query('SAVEPOINT sp_anon_neg');
        await assert.rejects(() => anonNegClient.query(badSql), /permission denied/i, `anon must be denied: ${badSql}`);
        await anonNegClient.query('ROLLBACK TO SAVEPOINT sp_anon_neg');
      }

      // Positive check: anon CAN read all 11 customer-safe columns on product_variants
      const anonVariants = await anonNegClient.query(
        `SELECT id, product_id, sku, title, attributes, price, discount_price, stock_status, is_active, created_at, updated_at
         FROM public.product_variants WHERE is_active = TRUE`
      );
      assert.ok(anonVariants.rowCount > 0, 'anon must be permitted to select customer-safe variant columns');

      // Positive check: anon CAN query customer-safe public_product_variants view
      const anonView = await anonNegClient.query(
        `SELECT id, sku, title, price, stock_status FROM public.public_product_variants`
      );
      assert.ok(anonView.rowCount > 0, 'anon must be permitted to query public_product_variants view');

      await anonNegClient.query('COMMIT');
    } finally {
      anonNegClient.release();
    }

    // 9B. Positive Customer Order-History Queries & Negative Security Tests for authenticated
    const custClient = await pool.connect();
    try {
      await custClient.query('BEGIN');
      await custClient.query('SET LOCAL ROLE authenticated');
      await custClient.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [customerUserId]);

      // Negative checks: authenticated customer CANNOT read idempotency_key, order_token, admin_notes, SELECT *, or purchase_cost, or mutate orders, or call process_order_checkout
      for (const badAuthSql of [
        `SELECT idempotency_key FROM public.orders WHERE id = '${firstOrder.order_id}'`,
        `SELECT order_token FROM public.orders WHERE id = '${firstOrder.order_id}'`,
        `SELECT admin_notes FROM public.orders WHERE id = '${firstOrder.order_id}'`,
        `SELECT * FROM public.orders WHERE id = '${firstOrder.order_id}'`,
        `SELECT purchase_cost FROM public.order_items WHERE order_id = '${firstOrder.order_id}'`,
        `SELECT * FROM public.order_items WHERE order_id = '${firstOrder.order_id}'`,
        `SELECT stock_quantity FROM public.product_variants WHERE id = '${var1Id}'`,
        `SELECT purchase_cost FROM public.product_variants WHERE id = '${var1Id}'`,
        `SELECT low_stock_threshold FROM public.product_variants WHERE id = '${var1Id}'`,
        `SELECT * FROM public.product_variants WHERE id = '${var1Id}'`,
        `INSERT INTO public.orders (customer_name, phone1, address_line, district, subtotal, total_amount, payment_method) VALUES ('Evil', '0770000000', 'X', 'Colombo', 0, 0, 'cod')`,
        `UPDATE public.orders SET payment_status = 'paid' WHERE id = '${firstOrder.order_id}'`,
        `DELETE FROM public.orders WHERE id = '${firstOrder.order_id}'`,
        `SELECT public.process_order_checkout('{}'::jsonb, '[]'::jsonb, NULL)`,
      ]) {
        await custClient.query('SAVEPOINT sp_auth_neg');
        await assert.rejects(() => custClient.query(badAuthSql), /permission denied/i, `authenticated must be denied: ${badAuthSql}`);
        await custClient.query('ROLLBACK TO SAVEPOINT sp_auth_neg');
      }

      // Verify authenticated customer cannot see another customer's / guest's order via RLS
      const crossOrderCheck = await custClient.query(
        `SELECT id, order_number FROM public.orders WHERE id = $1`,
        [guestOrder.order_id]
      );
      assert.equal(crossOrderCheck.rowCount, 0, 'RLS must prevent authenticated customer from viewing guest/other orders');

      // Exact projection 1: /account dashboard query
      const accountDashboardOrders = await custClient.query(
        `SELECT id, order_number, created_at, order_status, payment_status, total_amount
         FROM public.orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`,
        [customerUserId]
      );
      assert.equal(accountDashboardOrders.rowCount, 1);

      // Exact projection 2: /account/orders list query
      const accountOrdersList = await custClient.query(
        `SELECT
           id, order_number, created_at, order_status, payment_status, payment_method,
           subtotal, discount_amount, delivery_fee, total_amount
         FROM public.orders WHERE user_id = $1 ORDER BY created_at DESC`,
        [customerUserId]
      );
      assert.equal(accountOrdersList.rowCount, 1);

      // Exact projection 3: /account/orders/[orderId] detail query (all 24 customer-safe columns on orders + all 11 safe columns on order_items)
      const custOrderDetail = await custClient.query(
        `SELECT
           id, order_number, user_id, customer_name, email, phone1, phone2,
           address_line, city, district, province, postal_code, delivery_notes,
           subtotal, discount_amount, coupon_code, delivery_fee, total_amount,
           payment_method, payment_status, order_status, tracking_number,
           created_at, updated_at
         FROM public.orders WHERE id = $1 AND user_id = $2`,
        [firstOrder.order_id, customerUserId]
      );
      assert.equal(custOrderDetail.rowCount, 1);
      assert.equal(custOrderDetail.rows[0].address_line, '42 Flower Road');
      assert.equal(custOrderDetail.rows[0].city, 'Colombo 07');

      const custOrderItemsDetail = await custClient.query(
        `SELECT
           id, order_id, product_id, variant_id, product_name, variant_title,
           sku, quantity, unit_price, total_price, image_url
         FROM public.order_items WHERE order_id = $1`,
        [firstOrder.order_id]
      );
      assert.equal(custOrderItemsDetail.rowCount, 2);

      // Customer creates wishlist + wishlist_item and queries with product_images.url
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

      // Customer submits verified review with all columns used by submitCustomerReview
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

    // 9C. Verify defense-in-depth runtime guard inside process_order_checkout and cancel_order_and_restock rejects spoofed JWT claim role
    const jwtGuardClient = await pool.connect();
    try {
      await jwtGuardClient.query('BEGIN');
      await jwtGuardClient.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await assert.rejects(
        () => jwtGuardClient.query(`SELECT public.process_order_checkout('{}'::jsonb, '[]'::jsonb, NULL)`),
        /permission denied for function process_order_checkout/i
      );
      await jwtGuardClient.query('ROLLBACK');

      await jwtGuardClient.query('BEGIN');
      await jwtGuardClient.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await assert.rejects(
        () => jwtGuardClient.query(`SELECT public.cancel_order_and_restock($1::uuid, $2::uuid, NULL)`, [guestOrder.order_id, adminUserId]),
        /permission denied for function cancel_order_and_restock/i
      );
      await jwtGuardClient.query('ROLLBACK');
    } finally {
      jwtGuardClient.release();
    }

    // 9D. Admin Order Management Operations, Payment Verification, Admin Notes, Tracking & Atomic Order Cancellation/Restocking via service_role
    const adminOpsClient = await pool.connect();
    try {
      await adminOpsClient.query('BEGIN');
      await adminOpsClient.query('SET LOCAL ROLE service_role');

      // 1. Admin updates payment_status, admin_notes, and tracking_number on firstOrder
      await adminOpsClient.query(
        `UPDATE public.orders SET payment_status = 'verified', admin_notes = 'VIP priority dispatch', tracking_number = 'SL-POST-998877', updated_at = NOW() WHERE id = $1`,
        [firstOrder.order_id]
      );
      await adminOpsClient.query(
        `UPDATE public.payments SET status = 'verified', notes = 'Verified by admin', updated_at = NOW() WHERE order_id = $1`,
        [firstOrder.order_id]
      );

      // 2. Admin queries full order detail including confidential admin_notes, order_token, and order_items.purchase_cost
      const adminOrderDetail = await adminOpsClient.query(
        `SELECT o.id, o.order_number, o.order_token, o.admin_notes, o.tracking_number, o.payment_status,
                (SELECT SUM(oi.purchase_cost * oi.quantity) FROM public.order_items oi WHERE oi.order_id = o.id) AS total_cost
         FROM public.orders o WHERE o.id = $1`,
        [firstOrder.order_id]
      );
      assert.equal(adminOrderDetail.rowCount, 1);
      assert.equal(adminOrderDetail.rows[0].admin_notes, 'VIP priority dispatch');
      assert.equal(adminOrderDetail.rows[0].tracking_number, 'SL-POST-998877');
      assert.equal(adminOrderDetail.rows[0].payment_status, 'verified');
      assert.equal(Number(adminOrderDetail.rows[0].total_cost), 95000); // 2 * 30000 + 1 * 35000

      // 3. Admin cancels guestOrder via atomic cancel_order_and_restock RPC (var1 stock before cancel: 9 -> after cancel: 10)
      const stockBeforeCancel = await adminOpsClient.query(
        `SELECT stock_quantity FROM public.product_variants WHERE id = $1`,
        [var1Id]
      );
      assert.equal(stockBeforeCancel.rows[0].stock_quantity, 9);

      const cancelRes = await adminOpsClient.query(
        `SELECT public.cancel_order_and_restock($1::uuid, $2::uuid, 'Customer requested cancellation') AS result`,
        [guestOrder.order_id, adminUserId]
      );
      const cancelResult = cancelRes.rows[0].result;
      assert.equal(cancelResult.success, true);
      assert.equal(cancelResult.restocked, true);
      assert.equal(cancelResult.new_status, 'cancelled');

      const stockAfterCancel = await adminOpsClient.query(
        `SELECT stock_quantity, stock_status FROM public.product_variants WHERE id = $1`,
        [var1Id]
      );
      assert.equal(stockAfterCancel.rows[0].stock_quantity, 10, 'Cancelled order item quantity must be restocked');
      assert.equal(stockAfterCancel.rows[0].stock_status, 'in_stock');

      const restockMovement = await adminOpsClient.query(
        `SELECT quantity_change, previous_quantity, new_quantity, reason, created_by
         FROM public.inventory_movements
         WHERE reference_id = $1 AND reason = 'order_cancelled_restock'`,
        [guestOrder.order_number]
      );
      assert.equal(restockMovement.rowCount, 1);
      assert.equal(restockMovement.rows[0].quantity_change, 1);
      assert.equal(restockMovement.rows[0].previous_quantity, 9);
      assert.equal(restockMovement.rows[0].new_quantity, 10);
      assert.equal(restockMovement.rows[0].created_by, adminUserId);

      const couponUsageAfterCancel = await adminOpsClient.query(
        `SELECT COUNT(*)::int AS cnt FROM public.coupon_usage WHERE order_id = $1`,
        [guestOrder.order_id]
      );
      assert.equal(couponUsageAfterCancel.rows[0].cnt, 0, 'Coupon usage for cancelled order must be released');

      // 4. Calling cancel_order_and_restock a second time on the same order must be idempotent and never double-restock
      const secondCancelRes = await adminOpsClient.query(
        `SELECT public.cancel_order_and_restock($1::uuid, $2::uuid, 'Duplicate cancel click') AS result`,
        [guestOrder.order_id, adminUserId]
      );
      assert.equal(secondCancelRes.rows[0].result.idempotent, true);
      assert.equal(secondCancelRes.rows[0].result.restocked, false);

      const stockAfterSecondCancel = await adminOpsClient.query(
        `SELECT stock_quantity FROM public.product_variants WHERE id = $1`,
        [var1Id]
      );
      assert.equal(stockAfterSecondCancel.rows[0].stock_quantity, 10, 'Idempotent re-cancel must not double-restock');

      await adminOpsClient.query('COMMIT');
    } finally {
      adminOpsClient.release();
    }

    // 5. Cancellation Inventory Integrity: If an order item references a missing variant, raise exception & roll back entire cancellation
    const missingVarId = '99999999-9999-4999-8999-999999999999';
    const orderWithMissingVar = await pool.query(
      `INSERT INTO public.orders (
         customer_name, phone1, address_line, district, subtotal, total_amount, payment_method, order_status, idempotency_key
       ) VALUES ('Missing Var Tester', '0770001122', '10 Test Lane', 'Colombo', 90000, 90350, 'cod', 'pending', 'chk-missing-var-order-001')
       RETURNING id, order_number`
    );
    const corruptOrderId = orderWithMissingVar.rows[0].id;
    const corruptOrderNum = orderWithMissingVar.rows[0].order_number;

    // Temporarily bypass foreign key check to simulate an order item referencing a deleted/missing variant
    await pool.query(`SET session_replication_role = 'replica'`);
    await pool.query(
      `INSERT INTO public.order_items (order_id, product_id, variant_id, product_name, variant_title, sku, unit_price, quantity, total_price)
       VALUES
         ($1, $2, $3, 'Royal Sapphire Ring', 'Size 6', 'SJ-SAP-1', 45000, 1, 45000),
         ($1, $2, $4, 'Deleted Product Ring', 'Discontinued', 'SJ-DEL-1', 45000, 1, 45000)`,
      [corruptOrderId, prodId, var1Id, missingVarId]
    );
    await pool.query(`SET session_replication_role = 'origin'`);

    const stockBeforeCorruptCancel = await pool.query(`SELECT stock_quantity FROM public.product_variants WHERE id = $1`, [var1Id]);
    assert.equal(stockBeforeCorruptCancel.rows[0].stock_quantity, 10);

    const corruptCancelClient = await pool.connect();
    try {
      await corruptCancelClient.query('SET ROLE service_role');
      await assert.rejects(
        () => corruptCancelClient.query(`SELECT public.cancel_order_and_restock($1::uuid, $2::uuid, 'Cancel corrupt order')`, [corruptOrderId, adminUserId]),
        /Cannot restock order.*product variant.*not found/
      );
    } finally {
      corruptCancelClient.release();
    }

    // Verify entire cancellation rolled back: var1 stock unchanged, order still pending, no restock movements recorded
    const stockAfterCorruptCancel = await pool.query(`SELECT stock_quantity FROM public.product_variants WHERE id = $1`, [var1Id]);
    assert.equal(stockAfterCorruptCancel.rows[0].stock_quantity, 10, 'Stock of existing variant must not change if any variant is missing');

    const corruptOrderStatus = await pool.query(`SELECT order_status FROM public.orders WHERE id = $1`, [corruptOrderId]);
    assert.equal(corruptOrderStatus.rows[0].order_status, 'pending', 'Order status must remain pending after rolled-back cancellation');

    const corruptMovements = await pool.query(
      `SELECT 1 FROM public.inventory_movements WHERE reference_id = $1 AND reason = 'order_cancelled_restock'`,
      [corruptOrderNum]
    );
    assert.equal(corruptMovements.rowCount, 0, 'No restock movements must be committed on rolled-back cancellation');

    // 6. Concurrent Cancellation: 4 simultaneous requests cannot restore inventory more than once
    const concurrentOrderRes = await pool.query(
      `SELECT public.process_order_checkout($1::jsonb, $2::jsonb, NULL) AS result`,
      [
        JSON.stringify({
          customer_name: 'Concurrent Cancel Tester',
          phone1: '0779998877',
          address_line: '88 Lake Cross',
          district: 'Colombo',
          payment_method: 'cod',
          idempotency_key: 'chk-concurrent-cancel-order-01',
        }),
        JSON.stringify([{ variant_id: var1Id, quantity: 2 }]),
      ]
    );
    const concurrentOrder = concurrentOrderRes.rows[0].result;
    assert.equal(concurrentOrder.success, true);

    const stockBeforeConcCancel = await pool.query(`SELECT stock_quantity FROM public.product_variants WHERE id = $1`, [var1Id]);
    assert.equal(stockBeforeConcCancel.rows[0].stock_quantity, 8); // 10 - 2 = 8

    const cancelCalls = await Promise.all(
      Array.from({ length: 4 }, () =>
        pool.query(`SELECT public.cancel_order_and_restock($1::uuid, $2::uuid, 'Simultaneous cancel click') AS result`, [
          concurrentOrder.order_id,
          adminUserId,
        ])
      )
    );

    const cancelResults = cancelCalls.map((c) => c.rows[0].result);
    const restockedCount = cancelResults.filter((r) => r.restocked === true).length;
    const idempotentCount = cancelResults.filter((r) => r.idempotent === true).length;

    assert.equal(restockedCount, 1, 'Exactly 1 concurrent cancellation request must execute restock');
    assert.equal(idempotentCount, 3, 'Remaining 3 concurrent cancellation requests must return idempotent: true');

    const stockAfterConcCancel = await pool.query(`SELECT stock_quantity FROM public.product_variants WHERE id = $1`, [var1Id]);
    assert.equal(stockAfterConcCancel.rows[0].stock_quantity, 10, 'Inventory must be restored exactly once (8 + 2 = 10), never duplicated');
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

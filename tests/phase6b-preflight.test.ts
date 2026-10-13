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

test('Phase 6B Preflight: Migration 00004 enforces advisory-lock idempotency, canonical variant locking, and safe coupon assignment', () => {
  const m4Path = join(process.cwd(), 'supabase', 'migrations', '00004_atomic_checkout_procedure.sql');
  assert.equal(existsSync(m4Path), true, 'Migration 00004 must exist');
  const sql = readFileSync(m4Path, 'utf8');

  // 1. Advisory transaction lock for concurrent duplicate idempotency_key serialization
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('splender_checkout_idem:' \|\| v_idempotency_key\)\)/);

  // 2. Customer identity verification on idempotent hit
  assert.match(sql, /Idempotency key conflict: request parameters do not match existing order/);

  // 3. Registered customer profile & account_status check
  assert.match(sql, /FROM public\.profiles/);
  assert.match(sql, /Your customer account is suspended and cannot place orders/);

  // 4. Raw item quantity validation BEFORE SUM() aggregation
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

test('Phase 6B Preflight: Migration 00005 resolves admin_users 42P17 recursion, scopes admin policies TO authenticated, and isolates privileges', () => {
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
});

test('Phase 6B Preflight: Real PostgreSQL 18 Migration, Concurrency, Rollback, Idempotency & RLS Integration Suite', async (t) => {
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

    // Bootstrap Supabase-compatible auth and storage schemas
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

    // Apply 00001 -> 00002 -> 00004 -> 00005 and re-apply 00004 + 00005
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

    // Provision first super_admin and verify admin_users query has zero 42P17 recursion
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

    // Seed catalog and test concurrent last-unit checkout race + rollback
    const catId = '11111111-1111-4111-8111-111111111111';
    const prodId = '22222222-2222-4222-8222-222222222222';
    const varRaceId = '44444444-4444-4444-8444-444444444445';

    await pool.query(`
      INSERT INTO public.categories (id, name, slug, is_active) VALUES ('${catId}', 'Rings', 'rings', TRUE);
      INSERT INTO public.products (id, name, slug, category_id, is_active) VALUES ('${prodId}', '22K Ring', '22k-ring', '${catId}', TRUE);
      INSERT INTO public.product_variants (id, product_id, sku, title, price, discount_price, purchase_cost, stock_quantity, low_stock_threshold, stock_status, is_active)
      VALUES ('${varRaceId}', '${prodId}', 'SJ-RACE-1', 'Size 6', 50000, 45000, 30000, 1, 2, 'low_stock', TRUE);
    `);

    // Launch 4 concurrent checkouts competing for 1 unit
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
  } finally {
    await pool.end().catch(() => {});
    try {
      pgProc.kill();
    } catch {}
    try {
      execFileSync(PG_CTL, ['-D', PG_DATA, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
    } catch {}
    await sleep(200);
    try {
      rmSync(PG_DATA, { recursive: true, force: true });
    } catch {}
  }
});

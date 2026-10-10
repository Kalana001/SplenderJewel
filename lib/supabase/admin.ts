import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * STRICT SERVER-ONLY ADMINISTRATIVE CLIENT
 *
 * CRITICAL SECURITY ARCHITECTURE:
 * 1. This client operates with the Supabase `service_role` key, bypassing Row Level Security (RLS).
 * 2. It must NEVER be imported by any Client Component, browser-side code, or sent over public APIs.
 * 3. `import 'server-only'` guarantees build-time failure if client-side code attempts to bundle this.
 * 4. Used exclusively for administrative operations (e.g. recalculating costs, privileged audit logging,
 *    and secure back-office admin tasks).
 */

if (typeof window !== 'undefined') {
  throw new Error(
    '[FATAL SECURITY VIOLATION] lib/supabase/admin.ts was imported in a browser environment. Service role key must remain strictly server-side.'
  );
}

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[Supabase Admin] Supabase URL or Service Role Key is not configured. Admin backend actions require valid server environment variables.'
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

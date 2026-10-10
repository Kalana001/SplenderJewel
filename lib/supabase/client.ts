import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * Public browser-side Supabase client.
 * Safe for client components; uses only the public anon key.
 * If credentials are not yet configured in Phase 0, returns null safely.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Supabase Client] Supabase URL or Anon Key is missing. Supabase features will be initialized once configured in Phase 1.'
      );
    }
    return null;
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

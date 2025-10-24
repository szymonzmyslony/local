import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database_types';

/**
 * Create a fully typed Supabase client instance
 *
 * @param supabaseUrl - Supabase project URL (from env.SUPABASE_URL)
 * @param supabaseKey - Supabase anon key (from env.SUPABASE_ANON_KEY)
 * @returns Configured Supabase client with full type safety
 */
export function createSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  return createClient<Database>(supabaseUrl, supabaseKey);
}

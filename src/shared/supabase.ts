import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database_types";

export type SupabaseServiceClient = SupabaseClient<Database>;

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export function getServiceClient(env: SupabaseEnv): SupabaseServiceClient {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { fetch },
  });
}

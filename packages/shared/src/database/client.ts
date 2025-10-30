import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database_types";

export type SupabaseServiceClient = SupabaseClient<Database>;

interface SupabaseConfig {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
}

export function getServiceClient(env: SupabaseConfig): SupabaseServiceClient {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error("Missing Supabase key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)");
  }

  return createClient<Database>(env.SUPABASE_URL, key, {
    auth: { persistSession: false },
    global: { fetch },
  });
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database_types";

export type SupabaseServiceClient = SupabaseClient<Database>;

interface SupabaseConfig {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export function getServiceClient(env: SupabaseConfig): SupabaseServiceClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { fetch },
  });
}

export function getPublicClient(env: {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}): SupabaseServiceClient {
  if (!env.SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_ANON_KEY");
  }

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { fetch }
  });
}

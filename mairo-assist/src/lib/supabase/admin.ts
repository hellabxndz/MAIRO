import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "@/lib/env";

/**
 * Service-role client. BYPASSES row-level security — use only in server code
 * that has already authorized the caller (or for system work such as
 * webhooks and jobs), and always scope queries by business_id explicitly.
 */
export function createAdminClient() {
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

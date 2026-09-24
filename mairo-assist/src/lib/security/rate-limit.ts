import "server-only";
import { headers } from "next/headers";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256Hex } from "./tokens";

/**
 * Fixed-window rate limit backed by Postgres (public.rate_limit_hit), so it
 * holds across serverless instances. Returns true when the call is allowed.
 * Fails open (with a log line) only if the database is unreachable, so an
 * outage in the limiter never locks every merchant out of signing in.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) return true;
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    log.warn("rate_limit.unavailable", { error: error.message });
    return true;
  }
  return data === true;
}

/** A hashed client IP — rate-limit keys never store raw addresses. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return sha256Hex(`ip:${ip}`).slice(0, 32);
}

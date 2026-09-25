import "server-only";
import { z } from "zod";
import { normalizeOrigin } from "./url";

/**
 * Server-side configuration. Every integration is optional at boot so the
 * marketing site and dashboard work while credentials are still being set
 * up; each feature checks `is…Configured()` and explains what is missing
 * instead of pretending to work.
 */

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SECRET_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  NEXT_PUBLIC_APP_URL: optional,
  VERCEL_PROJECT_PRODUCTION_URL: optional,
  ENCRYPTION_KEY: optional,
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: optional,
  SHOPIFY_API_KEY: optional,
  SHOPIFY_API_SECRET: optional,
  SHOPIFY_API_VERSION: optional,
  SHOPIFY_SCOPES: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  CRON_SECRET: optional,
  AUTH_GOOGLE_ENABLED: optional,
});

type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export function supabaseUrl() {
  return env().NEXT_PUBLIC_SUPABASE_URL;
}

export function supabasePublishableKey() {
  return env().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env().NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function supabaseSecretKey() {
  return env().SUPABASE_SECRET_KEY ?? env().SUPABASE_SERVICE_ROLE_KEY;
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export function isSupabaseAdminConfigured() {
  return isSupabaseConfigured() && Boolean(supabaseSecretKey());
}

/** "Continue with Google" is shown only once the provider is set up in Supabase. */
export function isGoogleAuthEnabled() {
  return isSupabaseConfigured() && env().AUTH_GOOGLE_ENABLED === "true";
}

export function isOpenAIConfigured() {
  return Boolean(env().OPENAI_API_KEY && env().OPENAI_MODEL);
}

export function isShopifyConfigured() {
  return Boolean(env().SHOPIFY_API_KEY && env().SHOPIFY_API_SECRET && env().ENCRYPTION_KEY);
}

/** Latest stable Admin API version at the time of writing; override with SHOPIFY_API_VERSION. */
export const DEFAULT_SHOPIFY_API_VERSION = "2026-07";

/** Public origin of this deployment, without trailing slash. */
export function appUrl() {
  return normalizeOrigin(env().NEXT_PUBLIC_APP_URL) ?? normalizeOrigin(env().VERCEL_PROJECT_PRODUCTION_URL) ?? "http://localhost:3100";
}

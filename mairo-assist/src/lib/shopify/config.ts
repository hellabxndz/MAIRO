import "server-only";
import { appUrl, DEFAULT_SHOPIFY_API_VERSION, env, isShopifyConfigured } from "@/lib/env";

export { isShopifyConfigured };

/** Scopes requested at install. Customer scopes are added only when protected data access is approved. */
export function shopifyScopes(): string[] {
  const base = (env().SHOPIFY_SCOPES ?? "read_products,read_inventory,read_orders,write_script_tags")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (customerDataEnabled() && !base.includes("read_customers")) base.push("read_customers");
  return [...new Set(base)];
}

/**
 * Whether this app has Shopify's approval to read protected customer data
 * (names, emails). Until then, orders sync without personal details and
 * order lookup by email isn't possible.
 */
export function customerDataEnabled() {
  return process.env.SHOPIFY_CUSTOMER_DATA === "approved";
}

export function apiVersion() {
  return env().SHOPIFY_API_VERSION ?? DEFAULT_SHOPIFY_API_VERSION;
}

export function credentials() {
  const e = env();
  if (!e.SHOPIFY_API_KEY || !e.SHOPIFY_API_SECRET) throw new Error("Shopify is not configured");
  return { clientId: e.SHOPIFY_API_KEY, clientSecret: e.SHOPIFY_API_SECRET };
}

/**
 * Base URL for a shop's Admin endpoints. In automated tests only, requests
 * go to a local fake store instead; this is refused on production deployments.
 */
export function shopBaseUrl(shop: string) {
  const test = process.env.SHOPIFY_TEST_API_BASE_URL;
  if (test && process.env.VERCEL_ENV !== "production") return `${test.replace(/\/+$/, "")}/shops/${shop}`;
  return `https://${shop}`;
}

export function callbackUrl() {
  return `${appUrl()}/api/shopify/callback`;
}

export function webhookUrl() {
  return `${appUrl()}/api/webhooks/shopify`;
}

/** Cookie binding an OAuth attempt to the browser that started it. */
export const STATE_COOKIE = "ma_shopify_state";

/** Where the storefront reaches Mairo Assist: https://<shop>/<prefix>/<subpath> (App Proxy). */
export function proxyPath() {
  const raw = process.env.SHOPIFY_PROXY_PATH ?? "/apps/mairo-assist";
  return /^\/[a-z]+\/[a-z0-9_-]+$/i.test(raw) ? raw : "/apps/mairo-assist";
}

/** The widget script the store loads (added to the store as a script tag). */
export function widgetScriptUrl() {
  return `${appUrl()}/widget.js?proxy=${encodeURIComponent(proxyPath())}`;
}

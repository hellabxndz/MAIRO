import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/security/tokens";

/**
 * Pure helpers for Shopify's OAuth authorization-code grant. Network calls
 * take an injectable `fetch` so they can be tested without Shopify.
 */

/** Normalize what a merchant typed ("My Store", "mystore.myshopify.com/admin") to "mystore.myshopify.com". */
export function normalizeShopDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s.includes(".")) s = `${s.replace(/[^a-z0-9-]/g, "-")}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(s) ? s : null;
}

/** Build the query-string message Shopify signs: every param except hmac/signature, sorted. */
function signedMessage(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

/** Verify the `hmac` Shopify adds to install and OAuth redirect URLs. */
export function verifyQueryHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get("hmac");
  if (!hmac || !secret) return false;
  const digest = createHmac("sha256", secret).update(signedMessage(params)).digest("hex");
  return safeEqual(digest, hmac.toLowerCase());
}

/** Sign params the way Shopify does (used by tests and the local fake store). */
export function signQuery(params: Record<string, string>, secret: string): URLSearchParams {
  const p = new URLSearchParams(params);
  p.set("hmac", createHmac("sha256", secret).update(signedMessage(p)).digest("hex"));
  return p;
}

/** Verify X-Shopify-Hmac-Sha256 on a webhook: base64 HMAC-SHA256 of the raw body. */
export function verifyWebhookHmac(rawBody: string | Buffer, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  return safeEqual(digest, header.trim());
}

/** A Shopify timestamp older than this is rejected (replay protection). */
export const MAX_REDIRECT_AGE_SECONDS = 600;

export function isFreshTimestamp(ts: string | null, now = Date.now()) {
  const n = Number(ts);
  return Number.isFinite(n) && Math.abs(now / 1000 - n) <= MAX_REDIRECT_AGE_SECONDS;
}

export function authorizeUrl(opts: { shopBase: string; clientId: string; scopes: string[]; redirectUri: string; state: string }) {
  const url = new URL(`${opts.shopBase}/admin/oauth/authorize`);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("scope", opts.scopes.join(","));
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  // No grant_options[]=per-user: we want an offline token for background sync.
  return url.toString();
}

export type TokenSet = {
  accessToken: string;
  scopes: string[];
  accessTokenExpiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
};

export class ShopifyAuthError extends Error {
  constructor(message: string, readonly code: "invalid_grant" | "http" | "malformed") {
    super(message);
  }
}

function parseTokenResponse(json: Record<string, unknown>, now: number): TokenSet {
  if (typeof json.access_token !== "string" || !json.access_token) throw new ShopifyAuthError("No access token in response", "malformed");
  const secs = (v: unknown) => (typeof v === "number" && v > 0 ? new Date(now + v * 1000) : null);
  return {
    accessToken: json.access_token,
    scopes: typeof json.scope === "string" ? json.scope.split(",").map((s) => s.trim()).filter(Boolean) : [],
    accessTokenExpiresAt: secs(json.expires_in),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    refreshTokenExpiresAt: secs(json.refresh_token_expires_in),
  };
}

async function tokenRequest(shopBase: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<TokenSet> {
  const res = await fetchImpl(`${shopBase}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const invalid = res.status === 400 && /invalid_grant|invalid_request|expired/i.test(text);
    throw new ShopifyAuthError(`Token request failed (${res.status})`, invalid ? "invalid_grant" : "http");
  }
  return parseTokenResponse(json, Date.now());
}

/** Exchange the authorization code for an expiring offline token (expiring=1). */
export function exchangeCode(opts: { shopBase: string; clientId: string; clientSecret: string; code: string }, fetchImpl: typeof fetch = fetch) {
  return tokenRequest(opts.shopBase, { client_id: opts.clientId, client_secret: opts.clientSecret, code: opts.code, expiring: 1 }, fetchImpl);
}

/** Rotate tokens. Shopify returns a NEW refresh token each time; the old one stops working. */
export function refreshTokens(opts: { shopBase: string; clientId: string; clientSecret: string; refreshToken: string }, fetchImpl: typeof fetch = fetch) {
  return tokenRequest(
    opts.shopBase,
    { client_id: opts.clientId, client_secret: opts.clientSecret, grant_type: "refresh_token", refresh_token: opts.refreshToken },
    fetchImpl,
  );
}

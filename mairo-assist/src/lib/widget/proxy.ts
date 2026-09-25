import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/security/tokens";

/*
 * Shopify App Proxy signatures. Storefront requests to /apps/<subpath>/... are
 * forwarded by Shopify with shop, logged_in_customer_id, path_prefix, timestamp
 * and signature. The signature is the hex HMAC-SHA256 (app secret) of every
 * other parameter as "key=value" (repeated keys joined by commas), sorted by
 * key and concatenated with NO separator — unlike OAuth redirects.
 */

function proxyMessage(params: URLSearchParams) {
  const grouped = new Map<string, string[]>();
  for (const [k, v] of params) {
    if (k === "signature") continue;
    grouped.set(k, [...(grouped.get(k) ?? []), v]);
  }
  return [...grouped.keys()]
    .sort()
    .map((k) => `${k}=${grouped.get(k)!.join(",")}`)
    .join("");
}

export function verifyProxySignature(params: URLSearchParams, secret: string) {
  const sig = params.get("signature");
  if (!sig || !secret) return false;
  const expected = createHmac("sha256", secret).update(proxyMessage(params)).digest("hex");
  return safeEqual(expected, sig.toLowerCase());
}

/** Sign like Shopify's proxy does (tests and the local fake storefront). */
export function signProxyParams(params: Record<string, string>, secret: string) {
  const p = new URLSearchParams(params);
  p.set("signature", createHmac("sha256", secret).update(proxyMessage(p)).digest("hex"));
  return p;
}

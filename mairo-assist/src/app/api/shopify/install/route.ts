import { NextResponse, type NextRequest } from "next/server";
import { credentials, isShopifyConfigured } from "@/lib/shopify/config";
import { isFreshTimestamp, normalizeShopDomain, verifyQueryHmac } from "@/lib/shopify/oauth";

/**
 * The app URL Shopify opens when a merchant installs or launches the app from
 * their admin. After checking Shopify's signature we send them to
 * Integrations with the store filled in; the connection itself always starts
 * from a signed-in, explicit click (never from a GET like this one).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const target = new URL("/dashboard/integrations", request.nextUrl.origin);
  if (isShopifyConfigured() && verifyQueryHmac(params, credentials().clientSecret) && isFreshTimestamp(params.get("timestamp"))) {
    const shop = normalizeShopDomain(params.get("shop"));
    if (shop) target.searchParams.set("shop", shop);
  }
  return NextResponse.redirect(target);
}

import { after, NextResponse, type NextRequest } from "next/server";
import { recordActivity, recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/session";
import { drainJobs } from "@/lib/jobs/drain";
import { log } from "@/lib/log";
import { shopifyClient, storeTokens } from "@/lib/shopify/client";
import { apiVersion, credentials, customerDataEnabled, isShopifyConfigured, shopBaseUrl, STATE_COOKIE } from "@/lib/shopify/config";
import { enqueueSync } from "@/lib/shopify/jobs";
import { SHOP_QUERY } from "@/lib/shopify/mappers";
import { exchangeCode, isFreshTimestamp, normalizeShopDomain, verifyQueryHmac } from "@/lib/shopify/oauth";
import { safeNextPath } from "@/lib/security/redirect";
import { safeEqual, sha256Hex } from "@/lib/security/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isRole, parseGrants, permissionsFor } from "@/lib/tenancy/permissions";

export const maxDuration = 60;

/**
 * Shopify redirects here after the merchant approves access. Everything is
 * verified before a token is requested: Shopify's signature, freshness, and a
 * single-use state bound to this browser, user, business and shop.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let returnTo = "/dashboard/integrations";
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}shopify_error=${code}`, request.nextUrl.origin));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/shopify" });
    return res;
  };

  if (!isShopifyConfigured()) return fail("not_configured");
  if (params.get("error")) return fail("denied");
  const { clientId, clientSecret } = credentials();
  if (!verifyQueryHmac(params, clientSecret)) return fail("invalid_signature");
  if (!isFreshTimestamp(params.get("timestamp"))) return fail("expired");
  const shop = normalizeShopDomain(params.get("shop"));
  const code = params.get("code");
  const state = params.get("state") ?? "";
  if (!shop || !code || !state) return fail("invalid_request");

  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? "";
  if (!cookieState || !safeEqual(cookieState, state)) return fail("state_mismatch");

  const admin = createAdminClient();
  // Claim the state exactly once.
  const { data: st } = await admin
    .from("shopify_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state_hash", sha256Hex(state))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("business_id, user_id, shop_domain, return_to")
    .maybeSingle();
  if (!st) return fail("expired");
  returnTo = safeNextPath(st.return_to, "/dashboard/integrations");
  if (st.shop_domain !== shop) return fail("shop_mismatch");

  const user = await getSessionUser();
  if (!user || user.id !== st.user_id) return fail("wrong_user");
  const { data: member } = await (await createClient())
    .from("business_members")
    .select("role, permissions")
    .eq("business_id", st.business_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !isRole(member.role) || !permissionsFor(member.role, parseGrants(member.role, member.permissions)).has("integrations.manage")) {
    return fail("forbidden");
  }
  const businessId = st.business_id as string;

  let tokens;
  try {
    tokens = await exchangeCode({ shopBase: shopBaseUrl(shop), clientId, clientSecret, code });
  } catch (e) {
    log.warn("shopify.token_exchange_failed", { shop, error: e instanceof Error ? e.message : String(e) });
    return fail("token_exchange");
  }

  // Reuse this business's live connection for the same shop (a reconnect), else create one.
  const { data: existing } = await admin
    .from("shopify_connections")
    .select("id, shop_domain, status")
    .eq("business_id", businessId)
    .in("status", ["pending", "active", "reauth_required"])
    .maybeSingle();
  if (existing && existing.shop_domain !== shop) return fail("other_store_connected");
  let connectionId = existing?.id as string | undefined;
  if (!connectionId) {
    const { data: created, error } = await admin
      .from("shopify_connections")
      .insert({ business_id: businessId, shop_domain: shop, status: "pending", installed_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) return fail(error.code === "23505" ? "store_in_use" : "save_failed");
    connectionId = created.id as string;
  }

  try {
    await storeTokens(connectionId, businessId, tokens);
    // "Connected" only after a real API call succeeds with the new token.
    await admin.from("shopify_connections").update({ status: "pending" }).eq("id", connectionId);
    const client = await shopifyClient(connectionId, businessId);
    const { shop: info } = await client.graphql<{ shop: { id: string; name: string; currencyCode: string } }>(SHOP_QUERY);
    const scopes = tokens.scopes;
    const { error } = await admin
      .from("shopify_connections")
      .update({
        status: "active",
        validated_at: new Date().toISOString(),
        shop_name: info.name,
        shopify_shop_gid: info.id,
        currency: info.currencyCode,
        scopes,
        api_version: apiVersion(),
        customer_data_enabled: customerDataEnabled() && scopes.includes("read_customers"),
        last_error: null,
        disconnected_at: null,
      })
      .eq("id", connectionId);
    if (error) throw new Error(error.message);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn("shopify.validation_failed", { shop, error: message });
    await admin.from("shopify_connections").update({ last_error: "We couldn't verify access to the store. Please try connecting again." }).eq("id", connectionId);
    return fail("validation_failed");
  }

  await recordAudit({ businessId, actorUserId: user.id, action: "shopify.connected", targetType: "shopify_connection", targetId: connectionId, metadata: { shop, scopes: tokens.scopes } });
  await recordActivity({ businessId, type: "shopify.connected", summary: `Connected ${shop}` });
  await admin.from("shopify_connections").update({ last_sync_status: "running" }).eq("id", connectionId);
  await enqueueSync(businessId, connectionId, "products");
  after(() => drainJobs(`connect-${connectionId}`).catch((e) => log.warn("jobs.drain_failed", { error: String(e) })));

  const res = NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}shopify=connected`, request.nextUrl.origin));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/shopify" });
  return res;
}

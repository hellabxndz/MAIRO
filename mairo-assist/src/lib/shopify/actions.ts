"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { recordActivity, recordAudit } from "@/lib/audit";
import { drainJobs } from "@/lib/jobs/drain";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/redirect";
import { randomToken, sha256Hex } from "@/lib/security/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, PermissionError, type BusinessContext } from "@/lib/tenancy/context";
import { str, type FormState } from "@/lib/validation/form";
import { callbackUrl, credentials, isShopifyConfigured, shopBaseUrl, shopifyScopes, STATE_COOKIE } from "./config";
import { enqueueSync, purgeStoreData } from "./jobs";
import { authorizeUrl, normalizeShopDomain } from "./oauth";

const STATE_TTL_SECONDS = 600;

async function manager(): Promise<BusinessContext | null> {
  try {
    return await authorize("integrations.manage");
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

const DENIED: FormState = { message: "Only owners, and admins allowed to manage integrations, can change the store connection." };

/** Start Shopify's authorization for the store the merchant typed in. */
export async function startShopifyConnect(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  const raw = { shop: str(form, "shop") };
  if (!isShopifyConfigured()) return { message: "Shopify isn't configured on this deployment yet.", values: raw };

  const shop = normalizeShopDomain(raw.shop);
  if (!shop) return { errors: { shop: ["Enter your store's myshopify.com address, e.g. your-store.myshopify.com"] }, values: raw };
  if (!(await rateLimit(`shopify-connect:${ctx.user.id}`, 10, 600))) {
    return { message: "Too many attempts. Please wait a few minutes and try again.", values: raw };
  }

  const admin = createAdminClient();
  const { data: live } = await admin
    .from("shopify_connections")
    .select("business_id, shop_domain, status")
    .in("status", ["pending", "active", "reauth_required"])
    .or(`business_id.eq.${ctx.business.id},shop_domain.eq.${shop}`);
  for (const c of live ?? []) {
    if (c.business_id !== ctx.business.id) {
      return { message: "That store is already connected to another Mairo Assist business.", values: raw };
    }
    if (c.shop_domain !== shop && c.status === "active") {
      return { message: `Disconnect ${c.shop_domain} first — one store can be connected per business.`, values: raw };
    }
  }

  const state = randomToken(32);
  const returnTo = safeNextPath(str(form, "return_to"), "/dashboard/integrations");
  const { error } = await admin.from("shopify_oauth_states").insert({
    state_hash: sha256Hex(state),
    business_id: ctx.business.id,
    user_id: ctx.user.id,
    shop_domain: shop,
    return_to: returnTo,
    expires_at: new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) {
    log.error("shopify.state_insert_failed", { error: error.message });
    return { message: "We couldn't start the connection. Please try again.", values: raw };
  }

  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/shopify",
    maxAge: STATE_TTL_SECONDS,
  });

  redirect(
    authorizeUrl({
      shopBase: shopBaseUrl(shop),
      clientId: credentials().clientId,
      scopes: shopifyScopes(),
      redirectUri: callbackUrl(),
      state,
    }),
  );
}

/** Queue a fresh sync of products, inventory and recent orders. */
export async function syncShopifyNow(): Promise<FormState> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  const { data: conn } = await createAdminClient()
    .from("shopify_connections")
    .select("id, status")
    .eq("business_id", ctx.business.id)
    .eq("status", "active")
    .maybeSingle();
  if (!conn) return { message: "Connect your store first." };
  if (!(await rateLimit(`shopify-sync:${ctx.business.id}`, 6, 3600))) return { message: "A sync was started recently. Please try again later." };
  const { queued } = await enqueueSync(ctx.business.id, conn.id, "products");
  await createAdminClient().from("shopify_connections").update({ last_sync_status: "running", last_error: null }).eq("id", conn.id);
  after(() => drainJobs(`sync-${conn.id}`).catch((e) => log.warn("jobs.drain_failed", { error: String(e) })));
  revalidatePath("/dashboard/integrations");
  return { ok: true, message: queued ? "Sync started. It can take a few minutes for large stores." : "A sync is already in progress." };
}

/**
 * Disconnect the store: credentials and everything synced from it are
 * deleted, and the AI stops using store data. The app should also be
 * uninstalled in Shopify to revoke access there.
 */
export async function disconnectShopify(): Promise<FormState> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("shopify_connections")
    .select("id, shop_domain")
    .eq("business_id", ctx.business.id)
    .in("status", ["pending", "active", "reauth_required"])
    .maybeSingle();
  if (!conn) return { message: "No store is connected." };

  await admin.from("shopify_credentials").delete().eq("connection_id", conn.id);
  const { error } = await admin
    .from("shopify_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString(), last_error: null })
    .eq("id", conn.id);
  if (error) return { message: "We couldn't disconnect the store. Please try again." };
  await admin.from("background_jobs").delete().eq("business_id", ctx.business.id).like("type", "shopify.sync_%").eq("status", "queued");
  await purgeStoreData(ctx.business.id, conn.id);

  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "shopify.disconnected", targetType: "shopify_connection", targetId: conn.id, metadata: { shop: conn.shop_domain } });
  await recordActivity({ businessId: ctx.business.id, type: "shopify.disconnected", summary: `Disconnected ${conn.shop_domain}` });
  revalidatePath("/dashboard", "layout");
  // The page re-renders without the store, so it shows the confirmation itself.
  redirect(`/dashboard/integrations?disconnected=${encodeURIComponent(conn.shop_domain)}`);
}

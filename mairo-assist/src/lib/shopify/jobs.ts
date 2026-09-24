import "server-only";
import { recordActivity, recordAudit } from "@/lib/audit";
import type { Job, JobResult } from "@/lib/jobs/runner";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopifyApiError, ShopifyReauthRequired, shopifyClient, type ShopifyClient } from "./client";
import { customerDataEnabled, webhookUrl } from "./config";
import { INVENTORY_ITEM_QUERY, toGid, WEBHOOK_CREATE_MUTATION, WEBHOOK_TOPICS } from "./mappers";
import { markProductDeleted, refreshOrder, refreshProduct, syncOrdersSlice, syncProductsSlice } from "./sync";

/** Orders are synced for this many days back (Shopify's default access window is 60). */
export const ORDER_SYNC_DAYS = 60;

type SyncKind = "products" | "orders";

/**
 * Queue a sync for a connection. At most one per kind can be pending (a
 * partial unique index enforces it), so a second request is a no-op.
 */
export async function enqueueSync(businessId: string, connectionId: string, kind: SyncKind) {
  const { error } = await createAdminClient()
    .from("background_jobs")
    .insert({ business_id: businessId, type: `shopify.sync_${kind}`, payload: { connection_id: connectionId }, max_attempts: 6 });
  if (error && error.code !== "23505") throw new Error(`Could not queue the ${kind} sync: ${error.message}`);
  return { queued: !error };
}

async function setConnection(connectionId: string, patch: Record<string, unknown>) {
  const { error } = await createAdminClient().from("shopify_connections").update(patch).eq("id", connectionId);
  if (error) log.warn("shopify.connection_update_failed", { error: error.message });
}

/** Load a client for a job, or null when the store is no longer connected (the job then ends quietly). */
async function clientForJob(job: Job): Promise<ShopifyClient | null> {
  const connectionId = String(job.payload.connection_id ?? "");
  if (!job.business_id || !connectionId) throw new Error("Job is missing its store connection");
  try {
    const client = await shopifyClient(connectionId, job.business_id);
    if (client.connection.status !== "active") return null;
    return client;
  } catch (e) {
    if (e instanceof ShopifyReauthRequired) return null;
    if (e instanceof ShopifyApiError && /disconnected|not found/.test(e.message)) return null;
    throw e;
  }
}

/**
 * A disconnect can land while a slice is running; if it did, remove what the
 * slice just wrote rather than leave orphaned store data behind.
 */
async function disconnectedDuringSlice(businessId: string, connectionId: string) {
  const { data } = await createAdminClient()
    .from("shopify_connections")
    .select("id, status")
    .eq("business_id", businessId)
    .in("status", ["pending", "active", "reauth_required"]);
  if ((data ?? []).some((c) => c.id === connectionId && c.status === "active")) return false;
  if (!data?.length) await purgeStoreData(businessId, connectionId);
  return true;
}

/** Record why a sync stopped. Reauth errors aren't retried: nothing changes until the merchant reconnects. */
async function syncFailed(connectionId: string, e: unknown): Promise<JobResult> {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof ShopifyReauthRequired) {
    await setConnection(connectionId, { last_sync_status: "failed", last_error: message });
    return;
  }
  await setConnection(connectionId, { last_sync_status: "failed", last_error: message.slice(0, 500) });
  throw e;
}

/** Subscribe to the webhooks we handle. Existing subscriptions are fine ("already taken" isn't an error). */
export async function registerWebhooks(client: ShopifyClient) {
  const failures: string[] = [];
  for (const topic of WEBHOOK_TOPICS) {
    const data = await client.graphql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(WEBHOOK_CREATE_MUTATION, {
      topic,
      url: webhookUrl(),
    });
    const errors = data.webhookSubscriptionCreate.userErrors.filter((u) => !/already been taken|already exists/i.test(u.message));
    if (errors.length) failures.push(`${topic}: ${errors[0].message}`);
  }
  if (failures.length) throw new ShopifyApiError(`Could not subscribe to store updates (${failures.join("; ")})`);
  await setConnection(client.connection.id, { webhooks_registered_at: new Date().toISOString() });
}

export async function handleSyncProducts(job: Job): Promise<JobResult> {
  const client = await clientForJob(job);
  if (!client) return;
  const connectionId = client.connection.id;
  const startedAt = typeof job.payload.started_at === "string" ? job.payload.started_at : new Date().toISOString();
  try {
    if (!job.payload.started_at) {
      await setConnection(connectionId, { last_sync_status: "running", last_error: null });
      const { data: conn } = await createAdminClient().from("shopify_connections").select("webhooks_registered_at").eq("id", connectionId).single();
      if (!conn?.webhooks_registered_at) await registerWebhooks(client);
    }
    const cursor = typeof job.payload.cursor === "string" ? job.payload.cursor : null;
    const slice = await syncProductsSlice(client, { cursor, startedAt });
    if (await disconnectedDuringSlice(client.connection.business_id, connectionId)) return;
    if (slice.cursor) return { continueWith: { connection_id: connectionId, started_at: startedAt, cursor: slice.cursor } };

    const { count } = await createAdminClient()
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", client.connection.business_id)
      .is("deleted_at", null);
    await setConnection(connectionId, { products_synced: count ?? 0 });
    await enqueueSync(client.connection.business_id, connectionId, "orders");
  } catch (e) {
    return syncFailed(connectionId, e);
  }
}

export async function handleSyncOrders(job: Job): Promise<JobResult> {
  const client = await clientForJob(job);
  if (!client) return;
  const connectionId = client.connection.id;
  const since =
    typeof job.payload.since === "string" ? job.payload.since : new Date(Date.now() - ORDER_SYNC_DAYS * 86_400_000).toISOString();
  try {
    const { data: conn } = await createAdminClient().from("shopify_connections").select("customer_data_enabled").eq("id", connectionId).single();
    const withCustomer = Boolean(conn?.customer_data_enabled) && customerDataEnabled();
    const cursor = typeof job.payload.cursor === "string" ? job.payload.cursor : null;
    const slice = await syncOrdersSlice(client, { cursor, since, withCustomer });
    if (await disconnectedDuringSlice(client.connection.business_id, connectionId)) return;
    if (slice.cursor) return { continueWith: { connection_id: connectionId, since, cursor: slice.cursor } };

    const { count } = await createAdminClient()
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", client.connection.business_id);
    await setConnection(connectionId, {
      orders_synced: count ?? 0,
      last_sync_at: new Date().toISOString(),
      last_sync_status: "succeeded",
      last_error: null,
    });
    await recordActivity({
      businessId: client.connection.business_id,
      type: "shopify.synced",
      summary: "Store data synced from Shopify",
    });
  } catch (e) {
    return syncFailed(connectionId, e);
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

type WebhookRow = { id: string; business_id: string | null; topic: string; shop_domain: string | null; payload: Record<string, unknown> };

/** The connection a webhook belongs to: the live one for the shop, else the most recent. */
async function connectionForShop(shop: string) {
  const { data } = await createAdminClient()
    .from("shopify_connections")
    .select("id, business_id, status")
    .eq("shop_domain", shop)
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = data ?? [];
  return rows.find((r) => ["active", "pending", "reauth_required"].includes(r.status)) ?? rows[0] ?? null;
}

export async function handleShopifyWebhook(job: Job): Promise<JobResult> {
  const admin = createAdminClient();
  const { data: hook } = await admin
    .from("integration_webhooks")
    .select("id, business_id, topic, shop_domain, payload")
    .eq("id", String(job.payload.webhook_id ?? ""))
    .maybeSingle();
  if (!hook) return;
  const row = hook as WebhookRow;
  await admin.from("integration_webhooks").update({ status: "processing", attempts: job.attempts }).eq("id", row.id);
  try {
    const outcome = await processWebhook(row);
    await admin
      .from("integration_webhooks")
      .update({ status: outcome, processed_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("integration_webhooks").update({ status: "failed", last_error: message.slice(0, 2000) }).eq("id", row.id);
    throw e;
  }
}

async function processWebhook(row: WebhookRow): Promise<"processed" | "ignored"> {
  const shop = row.shop_domain;
  if (!shop) return "ignored";
  const conn = await connectionForShop(shop);
  if (!conn) return "ignored";
  const businessId = conn.business_id as string;
  const p = row.payload;

  switch (row.topic) {
    case "app/uninstalled":
      return appUninstalled(conn.id, businessId, shop);
    case "customers/data_request":
      return customerDataRequest(businessId, p);
    case "customers/redact":
      return customerRedact(businessId, p);
    case "shop/redact":
      return shopRedact(businessId, shop);
  }

  // Data topics need a working connection; updates for a disconnected store are dropped.
  if (conn.status !== "active") return "ignored";
  const client = await shopifyClient(conn.id, businessId).catch((e) => {
    if (e instanceof ShopifyReauthRequired) return null;
    throw e;
  });
  if (!client) return "ignored";

  switch (row.topic) {
    case "products/create":
    case "products/update": {
      const gid = toGid("Product", p.admin_graphql_api_id ?? p.id);
      if (!gid) return "ignored";
      await refreshProduct(client, gid);
      return "processed";
    }
    case "products/delete": {
      const gid = toGid("Product", p.id);
      if (!gid) return "ignored";
      await markProductDeleted(businessId, gid);
      return "processed";
    }
    case "inventory_levels/update": {
      const itemGid = toGid("InventoryItem", p.inventory_item_id);
      if (!itemGid) return "ignored";
      const productGid = await productForInventoryItem(client, businessId, itemGid);
      if (!productGid) return "ignored";
      await refreshProduct(client, productGid);
      return "processed";
    }
    case "orders/create":
    case "orders/updated":
    case "orders/cancelled": {
      const gid = toGid("Order", p.admin_graphql_api_id ?? p.id);
      if (!gid) return "ignored";
      const { data } = await createAdminClient().from("shopify_connections").select("customer_data_enabled").eq("id", conn.id).single();
      await refreshOrder(client, gid, Boolean(data?.customer_data_enabled) && customerDataEnabled());
      return "processed";
    }
  }
  return "ignored";
}

async function productForInventoryItem(client: ShopifyClient, businessId: string, itemGid: string) {
  const { data } = await createAdminClient()
    .from("product_variants")
    .select("products!inner(shopify_gid)")
    .eq("business_id", businessId)
    .eq("inventory_item_gid", itemGid)
    .limit(1)
    .maybeSingle();
  const known = (data?.products as unknown as { shopify_gid: string } | null)?.shopify_gid;
  if (known) return known;
  const res = await client.graphql<{ inventoryItem: { variant: { product: { id: string } } | null } | null }>(INVENTORY_ITEM_QUERY, { id: itemGid });
  return res.inventoryItem?.variant?.product.id ?? null;
}

/**
 * Remove everything synced from a store when it's disconnected or
 * uninstalled. It's the business's only store at that point, so every synced
 * order belongs to it. Reconnecting simply syncs again.
 */
export async function purgeStoreData(businessId: string, connectionId: string) {
  const admin = createAdminClient();
  await must(admin.from("orders").delete().eq("business_id", businessId));
  // Customers that came from Shopify are deleted (not marked redacted, so a
  // later reconnect can sync them again). Their conversations stay, unlinked.
  await must(admin.from("customers").delete().eq("business_id", businessId).not("shopify_gid", "is", null).is("redacted_at", null));
  await must(admin.from("products").delete().eq("business_id", businessId).eq("shopify_connection_id", connectionId));
  await must(admin.from("shopify_connections").update({ products_synced: null, orders_synced: null }).eq("id", connectionId));
}

async function appUninstalled(connectionId: string, businessId: string, shop: string): Promise<"processed" | "ignored"> {
  const admin = createAdminClient();
  const { data: updated } = await admin
    .from("shopify_connections")
    .update({ status: "uninstalled", disconnected_at: new Date().toISOString(), last_error: null })
    .eq("id", connectionId)
    .in("status", ["active", "pending", "reauth_required"])
    .select("id");
  await admin.from("shopify_credentials").delete().eq("connection_id", connectionId);
  if (!updated?.length) return "ignored"; // already disconnected by the merchant
  await purgeStoreData(businessId, connectionId);
  await recordAudit({ businessId, actorUserId: null, actorType: "system", action: "shopify.uninstalled", targetType: "shopify_connection", targetId: connectionId, metadata: { shop } });
  await recordActivity({ businessId, type: "shopify.uninstalled", summary: `The app was uninstalled from ${shop}` });
  return "processed";
}

/** Shopify asks the merchant to provide a customer's data; we can't answer for them, so open a ticket. */
async function customerDataRequest(businessId: string, p: Record<string, unknown>): Promise<"processed"> {
  const customer = (p.customer ?? {}) as { id?: unknown; email?: unknown };
  const orders = Array.isArray(p.orders_requested) ? p.orders_requested.length : 0;
  const email = typeof customer.email === "string" ? customer.email : "a customer";
  await createAdminClient()
    .from("support_tickets")
    .insert({
      business_id: businessId,
      type: "other",
      priority: "high",
      subject: "Customer data request from Shopify",
      description:
        `Shopify forwarded a data request for ${email} (${orders} order${orders === 1 ? "" : "s"} listed). ` +
        "You must send this customer the data you hold about them, including Mairo Assist conversations, within 30 days.",
      created_by_type: "system",
    });
  await recordAudit({ businessId, actorUserId: null, actorType: "system", action: "shopify.customer_data_request", metadata: { customer_id: String(customer.id ?? "") } });
  return "processed";
}

/** Erase a customer's personal data: conversations, leads, and identifying fields. */
async function customerRedact(businessId: string, p: Record<string, unknown>): Promise<"processed"> {
  const admin = createAdminClient();
  const customer = (p.customer ?? {}) as { id?: unknown; email?: unknown };
  const gid = toGid("Customer", customer.id);
  const email = typeof customer.email === "string" ? customer.email.toLowerCase() : null;

  const ids = new Set<string>();
  if (gid) {
    const { data } = await admin.from("customers").select("id").eq("business_id", businessId).eq("shopify_gid", gid);
    data?.forEach((c) => ids.add(c.id));
  }
  if (email) {
    const { data } = await admin.from("customers").select("id").eq("business_id", businessId).eq("email", email);
    data?.forEach((c) => ids.add(c.id));
  }
  const customerIds = [...ids];

  if (customerIds.length) {
    // Separate deletes: PostgREST rejects or= filters on writes.
    await must(admin.from("conversations").delete().eq("business_id", businessId).in("customer_id", customerIds));
    await must(admin.from("conversations").delete().eq("business_id", businessId).in("verified_customer_id", customerIds));
    await must(admin.from("leads").delete().eq("business_id", businessId).in("customer_id", customerIds));
    await must(admin.from("orders").update({ email: null, customer_id: null }).eq("business_id", businessId).in("customer_id", customerIds));
    await must(
      admin
        .from("customers")
        .update({ email: null, name: null, support_notes: null, preferred_channel: null, redacted_at: new Date().toISOString() })
        .in("id", customerIds),
    );
  }
  if (email) {
    await must(admin.from("leads").delete().eq("business_id", businessId).eq("email", email));
    await must(admin.from("orders").update({ email: null }).eq("business_id", businessId).eq("email", email));
  }
  const orderGids = (Array.isArray(p.orders_to_redact) ? p.orders_to_redact : []).map((id) => toGid("Order", id)).filter(Boolean) as string[];
  if (orderGids.length) {
    await must(admin.from("orders").update({ email: null, customer_id: null }).eq("business_id", businessId).in("shopify_gid", orderGids));
  }
  await recordAudit({ businessId, actorUserId: null, actorType: "system", action: "shopify.customer_redacted", metadata: { customers: customerIds.length, orders: orderGids.length } });
  return "processed";
}

/**
 * 48 hours after uninstall. The data was already removed at uninstall; this
 * clears anything left (e.g. if the uninstall webhook was missed).
 */
async function shopRedact(businessId: string, shop: string): Promise<"processed" | "ignored"> {
  const admin = createAdminClient();
  const { data: conns } = await admin.from("shopify_connections").select("id, shop_domain, status").eq("business_id", businessId);
  const live = (conns ?? []).filter((c) => ["active", "pending", "reauth_required"].includes(c.status));
  // Never erase a store the merchant has since reconnected.
  if (live.some((c) => c.shop_domain === shop)) return "ignored";
  const ids = (conns ?? []).filter((c) => c.shop_domain === shop).map((c) => c.id as string);
  for (const id of ids) {
    await must(admin.from("shopify_credentials").delete().eq("connection_id", id));
    if (live.length) {
      // Orders don't record their store, so with another store connected only products are cleared.
      await must(admin.from("products").delete().eq("business_id", businessId).eq("shopify_connection_id", id));
    } else {
      await purgeStoreData(businessId, id);
    }
  }
  await recordAudit({ businessId, actorUserId: null, actorType: "system", action: "shopify.shop_redacted", metadata: { shop } });
  return "processed";
}

async function must(q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  if (error) throw new Error(error.message);
}

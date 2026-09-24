import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShopifyClient } from "./client";
import {
  mapCustomer,
  mapFulfillment,
  mapLineItem,
  mapOrder,
  mapProduct,
  mapVariant,
  ordersPageQuery,
  orderQuery,
  PRODUCT_QUERY,
  PRODUCTS_PAGE_QUERY,
  type ShopifyOrder,
  type ShopifyProduct,
} from "./mappers";

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function upsertProduct(businessId: string, connectionId: string, p: ShopifyProduct) {
  const admin = createAdminClient();
  const row = must(
    await admin.from("products").upsert(mapProduct(p, businessId, connectionId), { onConflict: "business_id,shopify_gid" }).select("id").single(),
    "Saving product",
  );
  const variants = p.variants?.nodes ?? [];
  if (variants.length) {
    must(
      await admin.from("product_variants").upsert(variants.map((v) => mapVariant(v, businessId, row!.id)), { onConflict: "business_id,shopify_gid" }),
      "Saving variants",
    );
  }
  // Variants removed in Shopify disappear here too.
  const keep = variants.map((v) => v.id);
  let del = admin.from("product_variants").delete().eq("business_id", businessId).eq("product_id", row!.id);
  if (keep.length) del = del.not("shopify_gid", "in", `(${keep.map((g) => `"${g}"`).join(",")})`);
  must(await del, "Removing old variants");
  return row!.id as string;
}

export async function markProductDeleted(businessId: string, productGid: string) {
  must(
    await createAdminClient().from("products").update({ deleted_at: new Date().toISOString() }).eq("business_id", businessId).eq("shopify_gid", productGid),
    "Marking product deleted",
  );
}

export async function refreshProduct(client: ShopifyClient, productGid: string) {
  const { business_id: businessId, id: connectionId } = client.connection;
  const data = await client.graphql<{ product: ShopifyProduct | null }>(PRODUCT_QUERY, { id: productGid });
  if (!data.product) return markProductDeleted(businessId, productGid);
  await upsertProduct(businessId, connectionId, data.product);
}

const PAGES_PER_RUN = 10;

/**
 * One slice of a full catalog sync. Returns the cursor to continue from, or
 * null when the pass is complete (products not seen in the pass are then
 * marked deleted).
 */
export async function syncProductsSlice(client: ShopifyClient, opts: { cursor: string | null; startedAt: string }) {
  const { business_id: businessId, id: connectionId } = client.connection;
  let cursor = opts.cursor;
  let count = 0;
  for (let page = 0; page < PAGES_PER_RUN; page++) {
    const data = await client.graphql<{ products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyProduct[] } }>(
      PRODUCTS_PAGE_QUERY,
      { cursor },
    );
    for (const p of data.products.nodes) await upsertProduct(businessId, connectionId, p);
    count += data.products.nodes.length;
    if (!data.products.pageInfo.hasNextPage) {
      // Complete pass: anything not touched since the pass began is gone from Shopify.
      must(
        await createAdminClient()
          .from("products")
          .update({ deleted_at: new Date().toISOString() })
          .eq("business_id", businessId)
          .eq("shopify_connection_id", connectionId)
          .is("deleted_at", null)
          .lt("synced_at", opts.startedAt),
        "Marking removed products",
      );
      return { cursor: null, count };
    }
    cursor = data.products.pageInfo.endCursor;
  }
  return { cursor, count };
}

// ---------------------------------------------------------------------------
// Orders (and customers, only with protected-data approval)
// ---------------------------------------------------------------------------

async function upsertCustomer(businessId: string, c: NonNullable<ShopifyOrder["customer"]>): Promise<string | null> {
  const admin = createAdminClient();
  const row = mapCustomer(c, businessId);
  // Customers have partial unique indexes, so match explicitly: Shopify ID first, then email.
  const { data: byGid } = await admin.from("customers").select("id, redacted_at").eq("business_id", businessId).eq("shopify_gid", c.id).maybeSingle();
  let existing = byGid;
  if (!existing && row.email) {
    const { data } = await admin.from("customers").select("id, redacted_at").eq("business_id", businessId).eq("email", row.email).maybeSingle();
    existing = data;
  }
  if (existing?.redacted_at) return existing.id; // never re-fill a customer Shopify asked us to erase
  if (existing) {
    must(await admin.from("customers").update(row).eq("id", existing.id), "Updating customer");
    return existing.id;
  }
  const created = must(await admin.from("customers").insert(row).select("id").single(), "Creating customer");
  return created!.id;
}

export async function upsertOrder(businessId: string, o: ShopifyOrder) {
  const admin = createAdminClient();
  const customerId = o.customer ? await upsertCustomer(businessId, o.customer) : null;
  const order = must(
    await admin.from("orders").upsert(mapOrder(o, businessId, customerId), { onConflict: "business_id,shopify_gid" }).select("id").single(),
    "Saving order",
  );
  const orderId = order!.id as string;

  const items = o.lineItems?.nodes ?? [];
  if (items.length) {
    // Link line items to synced products/variants where we have them.
    const productGids = items.map((i) => i.product?.id).filter(Boolean) as string[];
    const variantGids = items.map((i) => i.variant?.id).filter(Boolean) as string[];
    const [{ data: products }, { data: variants }] = await Promise.all([
      productGids.length ? admin.from("products").select("id, shopify_gid").eq("business_id", businessId).in("shopify_gid", productGids) : Promise.resolve({ data: [] }),
      variantGids.length ? admin.from("product_variants").select("id, shopify_gid").eq("business_id", businessId).in("shopify_gid", variantGids) : Promise.resolve({ data: [] }),
    ]);
    const pid = new Map((products ?? []).map((p) => [p.shopify_gid, p.id]));
    const vid = new Map((variants ?? []).map((v) => [v.shopify_gid, v.id]));
    must(
      await admin.from("order_items").upsert(
        items.map((li) => ({
          ...mapLineItem(li, businessId, orderId),
          product_id: li.product ? pid.get(li.product.id) ?? null : null,
          variant_id: li.variant ? vid.get(li.variant.id) ?? null : null,
        })),
        { onConflict: "business_id,shopify_gid" },
      ),
      "Saving order items",
    );
  }

  const fulfillments = o.fulfillments ?? [];
  if (fulfillments.length) {
    must(
      await admin.from("fulfillments").upsert(fulfillments.map((f) => mapFulfillment(f, businessId, orderId)), { onConflict: "business_id,shopify_gid" }),
      "Saving fulfillments",
    );
  }
  return orderId;
}

export async function refreshOrder(client: ShopifyClient, orderGid: string, withCustomer: boolean) {
  const data = await client.graphql<{ order: ShopifyOrder | null }>(orderQuery(withCustomer), { id: orderGid });
  if (data.order) await upsertOrder(client.connection.business_id, data.order);
}

/** Orders updated in the last `days` days (Shopify's default access covers 60). */
export async function syncOrdersSlice(client: ShopifyClient, opts: { cursor: string | null; since: string; withCustomer: boolean }) {
  let cursor = opts.cursor;
  let count = 0;
  for (let page = 0; page < PAGES_PER_RUN; page++) {
    const data = await client.graphql<{ orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrder[] } }>(
      ordersPageQuery(opts.withCustomer),
      { cursor, query: `updated_at:>='${opts.since}'` },
    );
    for (const o of data.orders.nodes) await upsertOrder(client.connection.business_id, o);
    count += data.orders.nodes.length;
    if (!data.orders.pageInfo.hasNextPage) return { cursor: null, count };
    cursor = data.orders.pageInfo.endCursor;
  }
  return { cursor, count };
}

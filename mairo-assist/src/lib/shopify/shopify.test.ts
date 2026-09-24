import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { availabilityOf } from "@/lib/ai/product-tools";
import { mapFulfillment, mapOrder, mapProduct, mapVariant, safeUrl, toGid, type ShopifyOrder, type ShopifyProduct } from "./mappers";
import {
  authorizeUrl,
  exchangeCode,
  isFreshTimestamp,
  normalizeShopDomain,
  refreshTokens,
  ShopifyAuthError,
  signQuery,
  verifyQueryHmac,
  verifyWebhookHmac,
} from "./oauth";

const SECRET = "shpss_test_secret";

describe("normalizeShopDomain", () => {
  it.each([
    ["my-store.myshopify.com", "my-store.myshopify.com"],
    ["  My-Store.MyShopify.com ", "my-store.myshopify.com"],
    ["https://my-store.myshopify.com/admin/products", "my-store.myshopify.com"],
    ["my-store", "my-store.myshopify.com"],
  ])("%s → %s", (input, out) => expect(normalizeShopDomain(input)).toBe(out));

  it.each(["", "evil.com", "my-store.myshopify.com.evil.com", "a.b.myshopify.com", "-bad.myshopify.com", 42, null])("rejects %s", (input) => {
    expect(normalizeShopDomain(input)).toBeNull();
  });
});

describe("query HMAC", () => {
  it("accepts Shopify-signed params in any order and rejects tampering", () => {
    const signed = signQuery({ shop: "a.myshopify.com", timestamp: "1700000000", code: "abc", state: "s" }, SECRET);
    const reordered = new URLSearchParams([...signed.entries()].reverse());
    expect(verifyQueryHmac(reordered, SECRET)).toBe(true);
    signed.set("shop", "b.myshopify.com");
    expect(verifyQueryHmac(signed, SECRET)).toBe(false);
  });

  it("rejects a missing hmac or the wrong secret", () => {
    const signed = signQuery({ shop: "a.myshopify.com" }, SECRET);
    expect(verifyQueryHmac(signed, "other")).toBe(false);
    signed.delete("hmac");
    expect(verifyQueryHmac(signed, SECRET)).toBe(false);
  });

  it("checks timestamp freshness both ways", () => {
    const now = 1_700_000_000_000;
    expect(isFreshTimestamp(String(now / 1000 - 60), now)).toBe(true);
    expect(isFreshTimestamp(String(now / 1000 - 3600), now)).toBe(false);
    expect(isFreshTimestamp(String(now / 1000 + 3600), now)).toBe(false);
    expect(isFreshTimestamp(null, now)).toBe(false);
  });
});

describe("webhook HMAC", () => {
  const body = JSON.stringify({ id: 1, title: "Hat" });
  const header = createHmac("sha256", SECRET).update(body).digest("base64");
  it("verifies the raw body", () => {
    expect(verifyWebhookHmac(body, header, SECRET)).toBe(true);
    expect(verifyWebhookHmac(Buffer.from(body), header, SECRET)).toBe(true);
  });
  it("rejects a changed body, a missing header or the wrong secret", () => {
    expect(verifyWebhookHmac(body.replace("Hat", "Cap"), header, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, null, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, header, "other")).toBe(false);
  });
});

describe("OAuth", () => {
  it("builds an offline authorize URL", () => {
    const url = new URL(authorizeUrl({ shopBase: "https://a.myshopify.com", clientId: "cid", scopes: ["read_products", "read_orders"], redirectUri: "https://app/cb", state: "st" }));
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("read_products,read_orders");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.has("grant_options[]")).toBe(false);
  });

  it("requests an expiring token and parses expiry", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ access_token: "tok", scope: "read_products,read_orders", expires_in: 3600, refresh_token: "ref", refresh_token_expires_in: 7776000 }));
    }) as unknown as typeof fetch;
    const t = await exchangeCode({ shopBase: "https://a.myshopify.com", clientId: "c", clientSecret: "s", code: "x" }, fetchImpl);
    expect(sent.expiring).toBe(1);
    expect(t.accessToken).toBe("tok");
    expect(t.scopes).toEqual(["read_products", "read_orders"]);
    expect(t.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 3500_000);
    expect(t.refreshToken).toBe("ref");
  });

  it("reports a rejected refresh token as invalid_grant", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await expect(refreshTokens({ shopBase: "https://a.myshopify.com", clientId: "c", clientSecret: "s", refreshToken: "r" }, fetchImpl)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    await expect(refreshTokens({ shopBase: "https://a.myshopify.com", clientId: "c", clientSecret: "s", refreshToken: "r" }, fetchImpl)).rejects.toBeInstanceOf(ShopifyAuthError);
  });
});

const product: ShopifyProduct = {
  id: "gid://shopify/Product/1",
  title: "Trail Boot",
  handle: "trail-boot",
  description: "Waterproof",
  productType: "Boots",
  vendor: "Acme",
  tags: ["hiking"],
  status: "ACTIVE",
  onlineStoreUrl: "javascript:alert(1)",
  updatedAt: "2026-09-01T00:00:00Z",
  totalInventory: 0,
  tracksInventory: false,
  featuredMedia: null,
  media: { nodes: [{ preview: { image: { url: "https://cdn.shopify.com/a.jpg", altText: "boot" } } }] },
  options: [{ name: "Size", optionValues: [{ name: "9" }, { name: "10" }] }],
  priceRangeV2: { minVariantPrice: { amount: "120.00", currencyCode: "USD" }, maxVariantPrice: { amount: "130.00", currencyCode: "USD" } },
  variants: { nodes: [] },
};

describe("mappers", () => {
  it("maps a product without unsafe links or fake inventory", () => {
    const row = mapProduct(product, "b", "c");
    expect(row.online_store_url).toBeNull();
    expect(row.featured_image_url).toBe("https://cdn.shopify.com/a.jpg");
    expect(row.total_inventory).toBeNull(); // untracked: no count
    expect(row.price_min).toBe(120);
    expect(row.status).toBe("active");
    expect(row.options).toEqual([{ name: "Size", values: ["9", "10"] }]);
  });

  it("stores no quantity for untracked variants", () => {
    const v = mapVariant(
      { id: "gid://shopify/ProductVariant/1", title: "9", sku: null, price: "120.00", compareAtPrice: null, availableForSale: true, inventoryQuantity: 0, selectedOptions: [], image: null, inventoryItem: { id: "gid://shopify/InventoryItem/1", tracked: false } },
      "b",
      "p",
    );
    expect(v.inventory_quantity).toBeNull();
    expect(v.inventory_item_gid).toBe("gid://shopify/InventoryItem/1");
  });

  it("maps cancelled orders and keeps every tracking number", () => {
    const o = mapOrder({ id: "gid://shopify/Order/1", name: "#1001", cancelledAt: "2026-09-02T00:00:00Z", email: "A@B.COM", totalPriceSet: { shopMoney: { amount: "10.5", currencyCode: "EUR" } } } as ShopifyOrder, "b", null);
    expect(o.display_status).toBe("CANCELLED");
    expect(o.email).toBe("a@b.com");
    expect(o.total_price).toBe(10.5);
    const f = mapFulfillment(
      { id: "gid://shopify/Fulfillment/1", status: "SUCCESS", displayStatus: "IN_TRANSIT", createdAt: null, updatedAt: null, deliveredAt: null, estimatedDeliveryAt: null, trackingInfo: [{ company: "UPS", number: "1Z", url: "https://ups.com/1Z" }, { company: null, number: null, url: null }, { company: "DHL", number: "99", url: "data:x" }] },
      "b",
      "o",
    );
    expect(f.tracking).toEqual([{ company: "UPS", number: "1Z", url: "https://ups.com/1Z" }, { company: "DHL", number: "99", url: null }]);
    expect(f.tracking_number).toBe("1Z");
  });

  it("converts REST ids to GIDs", () => {
    expect(toGid("Product", 123)).toBe("gid://shopify/Product/123");
    expect(toGid("Order", "456")).toBe("gid://shopify/Order/456");
    expect(toGid("Order", "gid://shopify/Order/7")).toBe("gid://shopify/Order/7");
    expect(toGid("Order", "1 or 1=1")).toBeNull();
    expect(safeUrl("ftp://x")).toBeNull();
  });
});

describe("availability wording", () => {
  it("never reports stock it can't verify", () => {
    expect(availabilityOf({ available_for_sale: false, inventory_quantity: 5, inventory_tracked: true })).toBe("sold_out");
    expect(availabilityOf({ available_for_sale: true, inventory_quantity: 3, inventory_tracked: true })).toBe("in_stock");
    expect(availabilityOf({ available_for_sale: true, inventory_quantity: 0, inventory_tracked: true })).toBe("available_to_order");
    expect(availabilityOf({ available_for_sale: true, inventory_quantity: null, inventory_tracked: false })).toBe("available");
    expect(availabilityOf({ available_for_sale: null, inventory_quantity: 3, inventory_tracked: true })).toBe("unknown");
  });
});

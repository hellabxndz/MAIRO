// E2E ONLY: a small stand-in for a Shopify store's OAuth and Admin GraphQL
// endpoints, served under /shops/<shop>/... (the app points there only when
// SHOPIFY_TEST_API_BASE_URL is set, which production refuses).
//   GET  /shops/:shop/admin/oauth/authorize   -> approves at once and redirects back, signed like Shopify
//   POST /shops/:shop/admin/oauth/access_token -> code or refresh-token grant (refresh tokens rotate)
//   POST /shops/:shop/admin/api/:v/graphql.json -> the queries and mutation the app uses
//   GET  /__requests                           -> GraphQL operation log
//   POST /__catalog  {shop, patch}             -> change a product (e.g. inventory) for a shop
//   POST /__expire                             -> invalidate all access tokens (forces a refresh)
//   POST /__deny     {shop, deny: true}        -> make the next authorize return access_denied
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.FAKE_SHOPIFY_PORT ?? 54328);
const SECRET = process.env.SHOPIFY_API_SECRET ?? "e2e-shopify-secret";
const CLIENT_ID = process.env.SHOPIFY_API_KEY ?? "e2e-shopify-key";

const codes = new Map(); // code -> {shop, scope}
const access = new Map(); // token -> {shop, valid}
const refresh = new Map(); // token -> shop
const requests = [];
const deny = new Set();
const stores = new Map();

const token = (p) => `${p}_${randomBytes(12).toString("hex")}`;

function variant(id, title, { price, qty, tracked = true, available = true }) {
  return {
    id: `gid://shopify/ProductVariant/${id}`,
    title,
    sku: `SKU-${id}`,
    price,
    compareAtPrice: null,
    availableForSale: available,
    inventoryQuantity: qty,
    selectedOptions: [{ name: "Size", value: title }],
    image: null,
    inventoryItem: { id: `gid://shopify/InventoryItem/${id}`, tracked },
  };
}

function product(id, title, extra) {
  return {
    id: `gid://shopify/Product/${id}`,
    title,
    handle: title.toLowerCase().replace(/\s+/g, "-"),
    description: extra.description,
    productType: extra.productType,
    vendor: "Fixture Co",
    tags: extra.tags ?? [],
    status: extra.status ?? "ACTIVE",
    onlineStoreUrl: `https://fixture.example/products/${id}`,
    updatedAt: new Date().toISOString(),
    totalInventory: extra.variants.reduce((n, v) => n + (v.inventoryQuantity ?? 0), 0),
    tracksInventory: extra.variants.some((v) => v.inventoryItem.tracked),
    featuredMedia: null,
    media: { nodes: [] },
    options: [{ name: "Size", optionValues: extra.variants.map((v) => ({ name: v.title })) }],
    priceRangeV2: {
      minVariantPrice: { amount: extra.variants[0].price, currencyCode: "USD" },
      maxVariantPrice: { amount: extra.variants.at(-1).price, currencyCode: "USD" },
    },
    variants: { nodes: extra.variants },
  };
}

function seed(shop) {
  if (stores.has(shop)) return stores.get(shop);
  const store = {
    name: `Fixture ${shop.split(".")[0]}`,
    products: [
      product(101, "Trail Boot", {
        description: "Waterproof leather hiking boot.",
        productType: "Boots",
        tags: ["hiking", "waterproof"],
        variants: [variant(1011, "9", { price: "120.00", qty: 5 }), variant(1012, "10", { price: "120.00", qty: 0, available: false })],
      }),
      product(102, "Canvas Tote", {
        description: "Everyday canvas bag.",
        productType: "Bags",
        variants: [variant(1021, "One size", { price: "35.00", qty: null, tracked: false })],
      }),
      product(103, "Secret Sample", { description: "Not published.", productType: "Boots", status: "DRAFT", variants: [variant(1031, "9", { price: "1.00", qty: 1 })] }),
    ],
    orders: [
      {
        id: "gid://shopify/Order/5001",
        name: "#1001",
        processedAt: new Date(Date.now() - 86_400_000).toISOString(),
        updatedAt: new Date().toISOString(),
        cancelledAt: null,
        cancelReason: null,
        statusPageUrl: "https://fixture.example/orders/5001",
        displayFinancialStatus: "PAID",
        displayFulfillmentStatus: "FULFILLED",
        currencyCode: "USD",
        totalPriceSet: { shopMoney: { amount: "120.00", currencyCode: "USD" } },
        subtotalPriceSet: { shopMoney: { amount: "120.00", currencyCode: "USD" } },
        lineItems: { nodes: [{ id: "gid://shopify/LineItem/1", title: "Trail Boot", variantTitle: "9", sku: "SKU-1011", quantity: 1, originalUnitPriceSet: { shopMoney: { amount: "120.00" } }, product: { id: "gid://shopify/Product/101" }, variant: { id: "gid://shopify/ProductVariant/1011" }, image: null }] },
        fulfillments: [{ id: "gid://shopify/Fulfillment/1", status: "SUCCESS", displayStatus: "IN_TRANSIT", createdAt: new Date().toISOString(), updatedAt: null, deliveredAt: null, estimatedDeliveryAt: null, trackingInfo: [{ company: "UPS", number: "1Z999", url: "https://ups.example/1Z999" }] }],
      },
    ],
    webhooks: [],
  };
  stores.set(shop, store);
  return store;
}

function sign(params) {
  const msg = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHmac("sha256", SECRET).update(msg).digest("hex");
}

const json = (res, status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

function graphql(shop, body) {
  const store = seed(shop);
  const q = body.query ?? "";
  const op = /(?:query|mutation)\s+(\w+)/.exec(q)?.[1];
  const v = body.variables ?? {};
  requests.push({ shop, op, variables: v });
  const page = (list) => {
    const start = v.cursor ? Number(v.cursor) : 0;
    const nodes = list.slice(start, start + 50);
    const end = start + nodes.length;
    return { pageInfo: { hasNextPage: end < list.length, endCursor: String(end) }, nodes };
  };
  switch (op) {
    case "ShopInfo":
      return { data: { shop: { id: "gid://shopify/Shop/1", name: store.name, myshopifyDomain: shop, currencyCode: "USD" } } };
    case "ProductsPage":
      return { data: { products: page(store.products) } };
    case "ProductById":
      return { data: { product: store.products.find((p) => p.id === v.id) ?? null } };
    case "InventoryItemVariant": {
      for (const p of store.products) {
        const vr = p.variants.nodes.find((x) => x.inventoryItem.id === v.id);
        if (vr) return { data: { inventoryItem: { id: v.id, tracked: vr.inventoryItem.tracked, variant: { id: vr.id, product: { id: p.id } } } } };
      }
      return { data: { inventoryItem: null } };
    }
    case "OrdersPage":
      if (/customer\s*\{/.test(q)) return { errors: [{ message: "Access denied for customer field.", extensions: { code: "ACCESS_DENIED" } }] };
      return { data: { orders: page(store.orders) } };
    case "OrderById":
      return { data: { order: store.orders.find((o) => o.id === v.id) ?? null } };
    case "CreateWebhook":
      store.webhooks.push(v.topic);
      return { data: { webhookSubscriptionCreate: { webhookSubscription: { id: `gid://shopify/WebhookSubscription/${store.webhooks.length}` }, userErrors: [] } } };
  }
  return { errors: [{ message: `Unknown operation ${op}` }] };
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const body = raw ? JSON.parse(raw) : {};

      if (url.pathname === "/__requests") return json(res, 200, requests);
      if (url.pathname === "/__expire") {
        for (const t of access.values()) t.valid = false;
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/__deny") {
        if (body.deny) deny.add(body.shop);
        else deny.delete(body.shop);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/__catalog") {
        const store = seed(body.shop);
        const p = store.products.find((x) => x.id === body.productId);
        if (p && body.variant) Object.assign(p.variants.nodes.find((x) => x.id === body.variant.id), body.variant.patch);
        if (p && body.patch) Object.assign(p, body.patch);
        return json(res, 200, { ok: Boolean(p) });
      }

      const m = /^\/shops\/([a-z0-9-]+\.myshopify\.com)(\/.*)$/.exec(url.pathname);
      if (!m) return json(res, 404, { errors: "Not Found" });
      const [, shop, path] = m;

      if (path === "/admin/oauth/authorize") {
        const redirect = new URL(url.searchParams.get("redirect_uri"));
        if (url.searchParams.get("client_id") !== CLIENT_ID) return json(res, 400, { error: "invalid client" });
        const params = { shop, state: url.searchParams.get("state"), timestamp: String(Math.floor(Date.now() / 1000)), host: Buffer.from(`admin.shopify.com/store/${shop}`).toString("base64url") };
        if (deny.has(shop)) {
          params.error = "access_denied";
        } else {
          params.code = token("code");
          codes.set(params.code, { shop, scope: url.searchParams.get("scope") });
        }
        for (const [k, val] of Object.entries({ ...params, hmac: sign(params) })) redirect.searchParams.set(k, val);
        return res.writeHead(302, { location: redirect.toString() }).end();
      }

      if (path === "/admin/oauth/access_token" && req.method === "POST") {
        if (body.client_id !== CLIENT_ID || body.client_secret !== SECRET) return json(res, 401, { error: "invalid_client" });
        let scope;
        if (body.grant_type === "refresh_token") {
          if (refresh.get(body.refresh_token) !== shop) return json(res, 400, { error: "invalid_grant" });
          refresh.delete(body.refresh_token); // rotation: the old refresh token stops working
          scope = "read_products,read_inventory,read_orders";
        } else {
          const c = codes.get(body.code);
          codes.delete(body.code);
          if (!c || c.shop !== shop) return json(res, 400, { error: "invalid_request" });
          scope = c.scope;
        }
        const at = token("shpat");
        const rt = token("shprt");
        access.set(at, { shop, valid: true });
        refresh.set(rt, shop);
        return json(res, 200, { access_token: at, scope, expires_in: 3600, refresh_token: rt, refresh_token_expires_in: 7_776_000 });
      }

      if (/^\/admin\/api\/[\w-]+\/graphql\.json$/.test(path) && req.method === "POST") {
        const t = access.get(req.headers["x-shopify-access-token"]);
        if (!t || !t.valid || t.shop !== shop) return json(res, 401, { errors: "[API] Invalid API key or access token" });
        return json(res, 200, graphql(shop, body));
      }
      return json(res, 404, { errors: "Not Found" });
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake shopify on ${PORT}`));

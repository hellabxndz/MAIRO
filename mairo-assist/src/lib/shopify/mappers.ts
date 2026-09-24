/**
 * GraphQL documents and pure mappers from Shopify Admin API shapes to our
 * rows. Kept free of I/O so they can be unit-tested against sample payloads.
 */

export const SHOP_QUERY = /* GraphQL */ `
  query ShopInfo {
    shop { id name myshopifyDomain currencyCode }
  }
`;

const PRODUCT_FIELDS = /* GraphQL */ `
  id title handle description productType vendor tags status onlineStoreUrl updatedAt
  totalInventory tracksInventory
  featuredMedia { preview { image { url } } }
  media(first: 5) { nodes { preview { image { url altText } } } }
  options { name optionValues { name } }
  priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
  variants(first: 100) {
    nodes {
      id title sku price compareAtPrice availableForSale inventoryQuantity
      selectedOptions { name value }
      image { url }
      inventoryItem { id tracked }
    }
  }
`;

export const PRODUCTS_PAGE_QUERY = /* GraphQL */ `
  query ProductsPage($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;

export const PRODUCT_QUERY = /* GraphQL */ `
  query ProductById($id: ID!) {
    product(id: $id) { ${PRODUCT_FIELDS} }
  }
`;

export const INVENTORY_ITEM_QUERY = /* GraphQL */ `
  query InventoryItemVariant($id: ID!) {
    inventoryItem(id: $id) { id tracked variant { id product { id } } }
  }
`;

function orderFields(withCustomer: boolean) {
  return /* GraphQL */ `
  id name processedAt updatedAt cancelledAt cancelReason statusPageUrl
  displayFinancialStatus displayFulfillmentStatus currencyCode
  ${withCustomer ? "email customer { id email firstName lastName numberOfOrders amountSpent { amount currencyCode } }" : ""}
  totalPriceSet { shopMoney { amount currencyCode } }
  subtotalPriceSet { shopMoney { amount currencyCode } }
  lineItems(first: 50) {
    nodes {
      id title variantTitle sku quantity
      originalUnitPriceSet { shopMoney { amount } }
      product { id } variant { id } image { url }
    }
  }
  fulfillments(first: 10) {
    id status displayStatus createdAt updatedAt deliveredAt estimatedDeliveryAt
    trackingInfo(first: 10) { company number url }
  }`;
}

export function ordersPageQuery(withCustomer: boolean) {
  return /* GraphQL */ `
  query OrdersPage($cursor: String, $query: String) {
    orders(first: 50, after: $cursor, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { ${orderFields(withCustomer)} }
    }
  }`;
}

export function orderQuery(withCustomer: boolean) {
  return /* GraphQL */ `
  query OrderById($id: ID!) {
    order(id: $id) { ${orderFields(withCustomer)} }
  }`;
}

export const WEBHOOK_CREATE_MUTATION = /* GraphQL */ `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $url: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

/** Topics the app subscribes to via the API. Compliance topics are configured in the app settings instead. */
export const WEBHOOK_TOPICS = [
  "APP_UNINSTALLED",
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
] as const;

// ---------------------------------------------------------------------------
// Shapes (only the fields we read)
// ---------------------------------------------------------------------------

type Money = { amount: string; currencyCode?: string };
type Image = { url: string; altText?: string | null } | null;

export type ShopifyVariant = {
  id: string;
  title: string;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
  availableForSale: boolean | null;
  inventoryQuantity: number | null;
  selectedOptions: { name: string; value: string }[];
  image: Image;
  inventoryItem: { id: string; tracked: boolean | null } | null;
};

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string | null;
  description: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  status: string;
  onlineStoreUrl: string | null;
  updatedAt: string | null;
  totalInventory: number | null;
  tracksInventory: boolean | null;
  featuredMedia: { preview: { image: Image } | null } | null;
  media: { nodes: { preview: { image: Image } | null }[] } | null;
  options: { name: string; optionValues: { name: string }[] }[] | null;
  priceRangeV2: { minVariantPrice: Money; maxVariantPrice: Money } | null;
  variants: { nodes: ShopifyVariant[] };
};

export type ShopifyOrder = {
  id: string;
  name: string;
  processedAt: string | null;
  updatedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  statusPageUrl: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currencyCode: string | null;
  email?: string | null;
  customer?: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    numberOfOrders: string | number | null;
    amountSpent: Money | null;
  } | null;
  totalPriceSet: { shopMoney: Money } | null;
  subtotalPriceSet: { shopMoney: Money } | null;
  lineItems: {
    nodes: {
      id: string;
      title: string;
      variantTitle: string | null;
      sku: string | null;
      quantity: number;
      originalUnitPriceSet: { shopMoney: Money } | null;
      product: { id: string } | null;
      variant: { id: string } | null;
      image: Image;
    }[];
  };
  fulfillments: {
    id: string;
    status: string | null;
    displayStatus: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    deliveredAt: string | null;
    estimatedDeliveryAt: string | null;
    trackingInfo: { company: string | null; number: string | null; url: string | null }[];
  }[];
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const num = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Only http(s) links from Shopify are kept (never javascript: or data:). */
export function safeUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const PRODUCT_STATUS: Record<string, string> = { ACTIVE: "active", DRAFT: "draft", ARCHIVED: "archived", UNLISTED: "unlisted" };

export function mapProduct(p: ShopifyProduct, businessId: string, connectionId: string) {
  const images = (p.media?.nodes ?? [])
    .map((m) => m.preview?.image)
    .filter((i): i is NonNullable<Image> => Boolean(i?.url))
    .map((i) => ({ url: safeUrl(i.url), alt: i.altText ?? null }))
    .filter((i) => i.url);
  const featured = safeUrl(p.featuredMedia?.preview?.image?.url) ?? images[0]?.url ?? null;
  return {
    business_id: businessId,
    shopify_connection_id: connectionId,
    shopify_gid: p.id,
    title: p.title.slice(0, 500),
    handle: p.handle,
    description: p.description ? p.description.slice(0, 20000) : null,
    product_type: p.productType || null,
    vendor: p.vendor || null,
    tags: (p.tags ?? []).slice(0, 100),
    status: PRODUCT_STATUS[p.status] ?? "draft",
    online_store_url: safeUrl(p.onlineStoreUrl),
    featured_image_url: featured,
    images,
    options: (p.options ?? []).map((o) => ({ name: o.name, values: (o.optionValues ?? []).map((v) => v.name) })),
    price_min: num(p.priceRangeV2?.minVariantPrice.amount),
    price_max: num(p.priceRangeV2?.maxVariantPrice.amount),
    currency: p.priceRangeV2?.minVariantPrice.currencyCode ?? null,
    total_inventory: p.tracksInventory === false ? null : num(p.totalInventory),
    tracks_inventory: p.tracksInventory,
    shopify_updated_at: p.updatedAt,
    synced_at: new Date().toISOString(),
    deleted_at: null,
  };
}

export function mapVariant(v: ShopifyVariant, businessId: string, productId: string) {
  const tracked = v.inventoryItem?.tracked ?? null;
  return {
    business_id: businessId,
    product_id: productId,
    shopify_gid: v.id,
    inventory_item_gid: v.inventoryItem?.id ?? null,
    title: v.title.slice(0, 500),
    sku: v.sku || null,
    price: num(v.price),
    compare_at_price: num(v.compareAtPrice),
    selected_options: v.selectedOptions ?? [],
    available_for_sale: v.availableForSale,
    // Untracked inventory has no meaningful count: store NULL, never a guess.
    inventory_quantity: tracked === false ? null : num(v.inventoryQuantity),
    inventory_tracked: tracked,
    image_url: safeUrl(v.image?.url),
    synced_at: new Date().toISOString(),
  };
}

export function mapOrder(o: ShopifyOrder, businessId: string, customerId: string | null) {
  return {
    business_id: businessId,
    shopify_gid: o.id,
    customer_id: customerId,
    name: o.name,
    email: o.email ? o.email.toLowerCase() : null,
    processed_at: o.processedAt,
    financial_status: o.displayFinancialStatus,
    fulfillment_status: o.displayFulfillmentStatus,
    display_status: o.cancelledAt ? "CANCELLED" : o.displayFulfillmentStatus,
    cancelled_at: o.cancelledAt,
    cancel_reason: o.cancelReason,
    currency: o.totalPriceSet?.shopMoney.currencyCode ?? o.currencyCode,
    total_price: num(o.totalPriceSet?.shopMoney.amount),
    subtotal_price: num(o.subtotalPriceSet?.shopMoney.amount),
    status_page_url: safeUrl(o.statusPageUrl),
    shopify_updated_at: o.updatedAt,
    synced_at: new Date().toISOString(),
  };
}

export function mapCustomer(c: NonNullable<ShopifyOrder["customer"]>, businessId: string) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return {
    business_id: businessId,
    shopify_gid: c.id,
    email: c.email ? c.email.toLowerCase() : null,
    name: name || null,
    orders_count: num(c.numberOfOrders),
    total_spent: num(c.amountSpent?.amount),
    currency: c.amountSpent?.currencyCode ?? null,
  };
}

export function mapLineItem(li: ShopifyOrder["lineItems"]["nodes"][number], businessId: string, orderId: string) {
  return {
    business_id: businessId,
    order_id: orderId,
    shopify_gid: li.id,
    title: li.title.slice(0, 500),
    variant_title: li.variantTitle,
    sku: li.sku,
    quantity: Math.max(0, li.quantity),
    unit_price: num(li.originalUnitPriceSet?.shopMoney.amount),
    image_url: safeUrl(li.image?.url),
  };
}

export function mapFulfillment(f: ShopifyOrder["fulfillments"][number], businessId: string, orderId: string) {
  const tracking = (f.trackingInfo ?? [])
    .map((t) => ({ company: t.company, number: t.number, url: safeUrl(t.url) }))
    .filter((t) => t.number || t.url);
  const first = tracking[0];
  return {
    business_id: businessId,
    order_id: orderId,
    shopify_gid: f.id,
    status: f.status,
    display_status: f.displayStatus,
    tracking,
    tracking_company: first?.company ?? null,
    tracking_number: first?.number ?? null,
    tracking_url: first?.url ?? null,
    shipped_at: f.createdAt,
    delivered_at: f.deliveredAt,
    estimated_delivery_at: f.estimatedDeliveryAt,
    shopify_updated_at: f.updatedAt,
  };
}

/** REST webhook payloads carry numeric IDs; GraphQL wants GIDs. */
export function toGid(kind: "Product" | "Order" | "InventoryItem" | "Customer", id: unknown): string | null {
  if (typeof id === "string" && id.startsWith("gid://shopify/")) return id;
  const n = typeof id === "number" ? id : typeof id === "string" && /^\d+$/.test(id) ? Number(id) : NaN;
  return Number.isFinite(n) && n > 0 ? `gid://shopify/${kind}/${n}` : null;
}
